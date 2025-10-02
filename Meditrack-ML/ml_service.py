# MediTrack ML Service — DB + File endpoints (stock_inventory constrained for DB)

from fastapi import FastAPI, UploadFile, File, Form, Body
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List, Tuple, Union
from datetime import datetime
import os, sys, io, traceback
import pandas as pd
import numpy as np
from dotenv import load_dotenv

load_dotenv()
print("[ML] Python:", sys.executable)

# ---------------- DB driver: psycopg3 OR psycopg2 (auto-fallback) ----------------
_DB_DRIVER = None
try:
    import psycopg  # v3
    from psycopg.rows import dict_row
    _DB_DRIVER = "psycopg3"

    def _connect():
        dsn = os.getenv("DATABASE_URL")
        if not dsn:
            raise RuntimeError("DATABASE_URL not set")
        return psycopg.connect(dsn, autocommit=True, row_factory=dict_row, sslmode="require")
except Exception as _e1:
    try:
        import psycopg2  # v2
        from psycopg2.extras import RealDictCursor
        _DB_DRIVER = "psycopg2"

        def _connect():
            dsn = os.getenv("DATABASE_URL")
            if not dsn:
                raise RuntimeError("DATABASE_URL not set")
            conn = psycopg2.connect(dsn, sslmode="require")
            conn.autocommit = True
            return conn
    except Exception as _e2:
        raise RuntimeError(
            "Could not import a Postgres driver.\n"
            f"psycopg3 error: {_e1}\npsycopg2 error: {_e2}\n"
            "Install one inside the SAME venv used by Uvicorn."
        )

print("[ML] DB driver:", _DB_DRIVER)

app = FastAPI(title="MediTrack ML Service (DB + File)")

# CORS (open for local dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/ml"

# ---------------- Utilities ----------------

def _to_py(obj):
    import numpy as _np, pandas as _pd
    if isinstance(obj, (_np.integer,)): return int(obj)
    if isinstance(obj, (_np.floating,)): return float(obj)
    if isinstance(obj, (_np.bool_,)): return bool(obj)
    if isinstance(obj, _pd.Timestamp): return obj.isoformat()
    if isinstance(obj, _pd.Timedelta): return obj.isoformat()
    if isinstance(obj, _pd.Period): return obj.to_timestamp().isoformat()
    if isinstance(obj, _pd.RangeIndex): return list(map(int, obj))
    if isinstance(obj, _pd.Index): return [_to_py(x) for x in obj.tolist()]
    if isinstance(obj, _pd.Series): return _to_py(obj.to_dict())
    if isinstance(obj, _pd.DataFrame): return [_to_py(r) for r in obj.to_dict(orient="records")]
    if isinstance(obj, dict): return {str(k): _to_py(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)): return [_to_py(v) for v in obj]
    try: return obj.item()
    except Exception: return obj

def ok(data, status_code: int = 200):
    return JSONResponse(content=_to_py(data), status_code=status_code)

def err(message: str, status_code: int = 400, extra: Optional[Union[dict, str]] = None):
    payload = {"error": str(message)}
    if extra is not None: payload["detail"] = _to_py(extra)
    return JSONResponse(content=_to_py(payload), status_code=status_code)

def _fetchall(conn, sql: str, params: Optional[Union[tuple, dict]] = None):
    if _DB_DRIVER == "psycopg3":
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params or ())
            return cur.fetchall()
    else:
        from psycopg2.extras import RealDictCursor
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, params or ())
            return cur.fetchall()

# ---------------- Data readers ----------------

DATABASE_URL = os.getenv("DATABASE_URL")
PINNED_USAGE_SQL = os.getenv("ML_USAGE_SQL")

_DEFAULT_USAGE_SQL_CANDIDATES = [
    """
    SELECT si.medicine_name AS medicine,
           ABS(sm.change_qty) AS qty,
           sm.created_at AS date
    FROM public.stock_movements sm
    JOIN public.stock_inventory si ON si.id = sm.stock_id
    WHERE sm.change_qty < 0 AND sm.created_at IS NOT NULL
    """,
]

_DEFAULT_STOCK_SQL = "SELECT medicine_name AS medicine, quantity AS current_stock FROM public.stock_inventory"
PINNED_STOCK_SQL = os.getenv("ML_STOCK_SQL")

def _read_stock_df() -> pd.DataFrame:
    conn = _connect()
    try:
        sql = PINNED_STOCK_SQL or _DEFAULT_STOCK_SQL
        rows = _fetchall(conn, sql)
        if not rows: return pd.DataFrame(columns=["medicine", "current_stock"])
        df = pd.DataFrame(rows)
        df["medicine"] = df["medicine"].astype(str).str.strip()
        df["current_stock"] = pd.to_numeric(df["current_stock"], errors="coerce").fillna(0.0).astype(float)
        return df
    finally:
        try: conn.close()
        except Exception: pass

def _clean_usage_df(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty: return df
    cols = {c.lower().replace("_"," "): c for c in df.columns}
    med_col = cols.get("medicine name") or cols.get("medicine")
    qty_col = cols.get("qty") or cols.get("quantity") or cols.get("change qty")
    date_col = cols.get("date") or cols.get("created at")
    if not (med_col and qty_col and date_col):
        return pd.DataFrame(columns=["medicine","qty","date"])
    df = df.rename(columns={med_col:"medicine", qty_col:"qty", date_col:"date"})
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date"])
    df["medicine"] = df["medicine"].astype(str).str.strip()
    df["qty"] = pd.to_numeric(df["qty"], errors="coerce").fillna(0.0).abs()
    return df

def _read_usage_df() -> pd.DataFrame:
    conn = _connect()
    try:
        sqls = [PINNED_USAGE_SQL] if PINNED_USAGE_SQL else _DEFAULT_USAGE_SQL_CANDIDATES
        for sql in sqls:
            try:
                rows = _fetchall(conn, sql)
                if not rows: continue
                df = pd.DataFrame(rows)
                return _clean_usage_df(df)
            except Exception as e:
                print("[ML] usage SQL failed:", e)
                continue
        return pd.DataFrame(columns=["medicine", "qty", "date"])
    finally:
        try: conn.close()
        except Exception: pass

# ---------------- Core analytics ----------------

def _monthly_aggregate(df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.Timestamp]:
    if df is None or df.empty or "date" not in df.columns:
        today_m = pd.Timestamp.today().to_period("M").to_timestamp()
        return pd.DataFrame(columns=["medicine","ym","qty","month_idx"]), today_m

    df = df.copy()
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date"])
    if df.empty:
        today_m = pd.Timestamp.today().to_period("M").to_timestamp()
        return pd.DataFrame(columns=["medicine","ym","qty","month_idx"]), today_m

    # ✅ ensure datetime type before using .dt
    if not pd.api.types.is_datetime64_any_dtype(df["date"]):
        today_m = pd.Timestamp.today().to_period("M").to_timestamp()
        return pd.DataFrame(columns=["medicine","ym","qty","month_idx"]), today_m

    df["ym"] = df["date"].dt.to_period("M").dt.to_timestamp()
    monthly = df.groupby(["medicine","ym"], as_index=False)["qty"].sum().sort_values(["medicine","ym"])

    if monthly.empty:
        today_m = pd.Timestamp.today().to_period("M").to_timestamp()
        return pd.DataFrame(columns=["medicine","ym","qty","month_idx"]), today_m

    min_ym = monthly["ym"].min()
    monthly["month_idx"] = ((monthly["ym"].dt.year - min_ym.year) * 12 + (monthly["ym"].dt.month - min_ym.month)).astype(int)
    return monthly, min_ym

def _fit_linreg(x, y) -> Tuple[float, float]:
    if len(x) <= 1 or len(set(x)) == 1: return 0.0, float(np.mean(y))
    slope, intercept = np.polyfit(x, y, 1)
    return float(slope), float(intercept)

def _future_months(min_ym: pd.Timestamp, last_idx: int, horizon: int) -> List[pd.Timestamp]:
    base = min_ym.to_period("M").to_timestamp()
    return [base + pd.DateOffset(months=i) for i in range(last_idx + 1, last_idx + horizon + 1)]

def _forecast_from_monthly(monthly: pd.DataFrame, min_ym: pd.Timestamp, horizon: int = 6):
    if monthly.empty: return []
    last_idx = int(monthly["month_idx"].max())
    future_yms = _future_months(min_ym, last_idx, horizon)
    future_idxs = list(range(last_idx + 1, last_idx + horizon + 1))
    out = []
    for med, grp in monthly.groupby("medicine", sort=False):
        x, y = grp["month_idx"].values.astype(float), grp["qty"].values.astype(float)
        slope, intercept = _fit_linreg(x, y)
        for idx, ym in zip(future_idxs, future_yms):
            yhat = max(0.0, slope * idx + intercept)
            out.append({"medicine": str(med), "forecast_month": ym.strftime("%Y-%m"), "forecast_qty": float(yhat)})
    return sorted(out, key=lambda r: (r["medicine"], r["forecast_month"]))

# ---------------- Health ----------------

@app.get(f"{API_PREFIX}/health")
def health():
    dsn = "set" if bool(DATABASE_URL) else "missing"
    return ok({
        "ok": True,   # 👈 add this
        "status": "ok",
        "db": dsn,
        "driver": _DB_DRIVER
    })


# ---------------- Forecast (DB) ----------------

@app.get(f"{API_PREFIX}/forecast_db")
def forecast_db(horizon: int = 6, include_all_stock: bool = True):
    try:
        stock = _read_stock_df()
        stock_meds = stock["medicine"].tolist()
        stock_set = {m.casefold() for m in stock_meds}

        usage = _read_usage_df()
        if usage.empty: return ok([])

        usage = usage[usage["medicine"].str.casefold().isin(stock_set)].copy()
        if usage.empty: return ok([])

        monthly, min_ym = _monthly_aggregate(usage)
        if monthly.empty: return ok([])

        out = _forecast_from_monthly(monthly, min_ym, int(horizon))

        # zero-fill
        if include_all_stock:
            months = sorted({r["forecast_month"] for r in out})
            have = {r["medicine"] for r in out}
            for med in stock_meds:
                if med not in have:
                    for fm in months:
                        out.append({"medicine": med, "forecast_month": fm, "forecast_qty": 0.0})

        return ok(sorted(out, key=lambda r: (r["medicine"], r["forecast_month"])))
    except Exception as e:
        print("[forecast_db ERROR]", traceback.format_exc())
        return err("forecast_db_failed", 500, extra=str(e))

# ---------------- Seasonality (DB) ----------------

@app.get(f"{API_PREFIX}/seasonality_db")
def seasonality_db():
    try:
        stock = _read_stock_df()
        stock_set = {m.casefold() for m in stock["medicine"].tolist()}
        usage = _read_usage_df()
        usage = usage[usage["medicine"].str.casefold().isin(stock_set)].copy()
        if usage.empty: return ok([])

        usage["month"] = usage["date"].dt.month
        seasonal = usage.groupby(["medicine","month"], as_index=False)["qty"].sum()
        peak = seasonal.sort_values(["medicine","qty","month"], ascending=[True,False,True]).groupby("medicine").first().reset_index()
        peak["peak_month_name"] = peak["month"].apply(lambda m: datetime(2000,int(m),1).strftime("%B"))
        peak = peak.rename(columns={"qty":"peak_month_total"})
        return ok(peak.to_dict(orient="records"))
    except Exception as e:
        print("[seasonality_db ERROR]", traceback.format_exc())
        return err("seasonality_db_failed", 500, extra=str(e))

# ---------------- Restock (DB) ----------------

@app.get(f"{API_PREFIX}/restock_db")
def restock_db(horizon: int = 6):
    try:
        stock = _read_stock_df()
        stock_map = {r["medicine"].casefold(): r["current_stock"] for _, r in stock.iterrows()}

        fc_rows = forecast_db.__wrapped__(horizon=horizon, include_all_stock=True).body
        import json
        if isinstance(fc_rows, (bytes, bytearray)):
            fc_rows = json.loads(fc_rows)

        if not fc_rows: return ok([])

        plan = []
        df = pd.DataFrame(fc_rows)
        for med, rows in df.groupby("medicine"):
            cur = float(stock_map.get(med.casefold(), 0.0))
            cum = 0.0
            restock_month = None
            months_to_stockout = None
            for i, r in enumerate(rows.sort_values("forecast_month").itertuples(index=False)):
                cum += float(r.forecast_qty)
                if cum > cur:
                    restock_month = r.forecast_month
                    months_to_stockout = i + 1
                    break
            plan.append({"medicine": med, "current_stock": cur, "restock_month": restock_month, "months_to_stockout": months_to_stockout})
        return ok(plan)
    except Exception as e:
        print("[restock_db ERROR]", traceback.format_exc())
        return err("restock_db_failed", 500, extra=str(e))

# ---------------- Forecast (File or JSON) ----------------

@app.post(f"{API_PREFIX}/forecast")
async def forecast_endpoint(horizon: int = Form(None), file: UploadFile = File(None), data: List[dict] = Body(None)):
    try:
        if file:
            content = await file.read()
            df = pd.read_excel(io.BytesIO(content)) if file.filename.endswith(".xlsx") else pd.read_csv(io.BytesIO(content))
        elif data:
            df = pd.DataFrame(data)
        else:
            return err("No input provided (file or JSON required)", 400)

        usage = _clean_usage_df(df)
        monthly, min_ym = _monthly_aggregate(usage)
        out = _forecast_from_monthly(monthly, min_ym, int(horizon or 6)) if not monthly.empty else []
        return ok(sorted(out, key=lambda r: (r["medicine"], r["forecast_month"])))
    except Exception as e:
        print("[forecast ERROR]", traceback.format_exc())
        return err("forecast_failed", 400, extra=str(e))

# ---------------- Restock (File) ----------------

@app.post(f"{API_PREFIX}/restock")
async def restock_file(
    forecast_csv: UploadFile = File(...),
    current_stock_csv: UploadFile = File(...)
):
    try:
        fdf = pd.read_csv(forecast_csv.file)
        cdf = pd.read_csv(current_stock_csv.file)
        months = sorted(fdf["forecast_month"].unique().tolist())
        first_month = months[0] if months else None

        plan = []
        for med, g in fdf.groupby("medicine"):
            g = g.sort_values("forecast_month")
            cur = float(cdf.loc[cdf["medicine"].str.casefold()==med.casefold(), "current_stock"].sum())
            cum = 0.0; restock_month = None; months_to_stockout = None
            for i, r in enumerate(g.itertuples(index=False)):
                cum += float(r.forecast_qty)
                if cum > cur:
                    restock_month = r.forecast_month; months_to_stockout = int(i + 1); break
            plan.append({"medicine": med, "current_stock": cur, "restock_month": restock_month, "months_to_stockout": months_to_stockout})
        return ok(plan)
    except Exception as e:
        print("[restock_file ERROR]", traceback.format_exc())
        return err("restock_file_failed", 400, extra=str(e))

# ---------------- Debug ----------------

@app.get(f"{API_PREFIX}/_debug_snapshot")
def _debug_snapshot():
    try:
        stock = _read_stock_df()
        usage = _read_usage_df()
        if not usage.empty:
            usage = usage.copy()
            usage["date"] = pd.to_datetime(usage["date"], errors="coerce").astype(str)
        return ok({
            "stock_count": int(len(stock)),
            "usage_count": int(len(usage)),
            "stock_cols": list(stock.columns),
            "usage_cols": list(usage.columns),
            "stock_sample": stock.head(5).to_dict(orient="records"),
            "usage_sample": usage.head(5).to_dict(orient="records"),
        })
    except Exception as e:
        return err("debug_failed", 500, extra=str(e))

# ... (keep everything you already have above)

from pydantic import BaseModel

# ---------------- Models for JSON stock forecast ----------------
class StockForecastRequest(BaseModel):
    current_stock: List[dict]
    horizon: int = 6

# ---------------- Extra Forecast endpoint (for Stock.jsx) ----------------
@app.post(f"{API_PREFIX}/forecast_json")
def forecast_json(req: StockForecastRequest):
    """
    Handles payloads like:
    {
      "current_stock": [{"medicine": "Paracetamol", "current_stock": 120}],
      "horizon": 6
    }
    """
    try:
        results = []
        for item in req.current_stock:
            med = item.get("medicine")
            stock = float(item.get("current_stock", 0))
            restock_month = None
            months_to_stockout = None

            # naive rule: if stock < 50 → plan restock next month
            if stock < 50:
                restock_month = (datetime.today() + pd.DateOffset(months=1)).strftime("%Y-%m")
                months_to_stockout = 1

            results.append({
                "medicine": med,
                "current_stock": stock,
                "restock_month": restock_month,
                "months_to_stockout": months_to_stockout
            })

        return ok(results)
    except Exception as e:
        print("[forecast_json ERROR]", traceback.format_exc())
        return err("forecast_json_failed", 400, extra=str(e))


# ---------------- Compatibility wrapper ----------------
@app.post(f"{API_PREFIX}/forecast_all")
async def forecast_endpoint_compat(

    horizon: int = Form(None),
    file: UploadFile = File(None),
    data: List[dict] = Body(None),
    req: StockForecastRequest = None
):
    """
    Unified endpoint:
      - If file is uploaded → use file path
      - If "data" has medicine/qty/date → use usage forecast
      - If JSON with "current_stock" → use stock forecast
    """
    try:
        if req and req.current_stock:
            return forecast_json(req)

        if file:
            content = await file.read()
            df = pd.read_excel(io.BytesIO(content)) if file.filename.endswith(".xlsx") else pd.read_csv(io.BytesIO(content))
            usage = _clean_usage_df(df)
            monthly, min_ym = _monthly_aggregate(usage)
            out = _forecast_from_monthly(monthly, min_ym, int(horizon or 6)) if not monthly.empty else []
            return ok(sorted(out, key=lambda r: (r["medicine"], r["forecast_month"])))

        elif data:
            df = pd.DataFrame(data)
            usage = _clean_usage_df(df)
            monthly, min_ym = _monthly_aggregate(usage)
            out = _forecast_from_monthly(monthly, min_ym, int(horizon or 6)) if not monthly.empty else []
            return ok(sorted(out, key=lambda r: (r["medicine"], r["forecast_month"])))

        return err("No input provided (file, JSON usage, or current_stock required)", 400)

    except Exception as e:
        print("[forecast ERROR]", traceback.format_exc())
        return err("forecast_failed", 400, extra=str(e))
