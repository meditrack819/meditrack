# MediTrack ML Service — DB + File endpoints (stock_inventory constrained for DB)
# DB endpoints:
#   GET /api/ml/health
#   GET /api/ml/forecast_db?horizon=6&include_all_stock=true
#   GET /api/ml/top_forecast_db?horizon=6&metric=next&top=0&include_all_stock=true
#   GET /api/ml/seasonality_db
#   GET /api/ml/restock_db?horizon=6
#   GET /api/ml/_debug_snapshot
#
# File endpoints (optional; used by your UI uploader):
#   POST /api/ml/forecast            (xlsx/csv with medicine/qty/date)
#   POST /api/ml/top_forecast        (xlsx/csv with medicine/qty/date)
#   POST /api/ml/seasonality         (xlsx/csv with medicine/qty/date)
#   POST /api/ml/restock             (forecast_csv + current_stock_csv)

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List, Tuple, Union
from datetime import datetime
import os, sys, io
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

def _norm_col(s: str) -> str:
    return str(s).strip().lower().replace("_", " ")

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

# Default usage reader tailored to YOUR schema (negative change_qty = consumption)
PINNED_USAGE_SQL = os.getenv("ML_USAGE_SQL")  # optional override
_DEFAULT_USAGE_SQL_CANDIDATES = [
    # (Your schema) stock_movements joined to stock_inventory; negative deltas are consumption.
    """
    SELECT si.medicine_name AS medicine_name,
           ABS(sm.change_qty) AS qty,
           sm.created_at      AS date
    FROM public.stock_movements sm
    JOIN public.stock_inventory si ON si.id = sm.stock_id
    WHERE sm.change_qty < 0 AND sm.created_at IS NOT NULL
    """,
    # fallbacks if you later add these tables:
    "SELECT medicine_name, qty, date FROM medicine_usage WHERE qty IS NOT NULL AND date IS NOT NULL",
]

_DEFAULT_STOCK_SQL = "SELECT medicine_name, quantity AS current_stock FROM public.stock_inventory"
PINNED_STOCK_SQL = os.getenv("ML_STOCK_SQL")  # optional override

def _read_stock_df() -> pd.DataFrame:
    conn = _connect()
    try:
        sql = PINNED_STOCK_SQL or _DEFAULT_STOCK_SQL
        rows = _fetchall(conn, sql)
        if not rows: return pd.DataFrame(columns=["medicine", "current_stock"])
        df = pd.DataFrame(rows)
        cmap = {_norm_col(c): c for c in df.columns}
        med_col = cmap.get("medicine name") or cmap.get("medicine_name") or cmap.get("medicine")
        stock_col = cmap.get("current stock") or cmap.get("quantity") or cmap.get("qty")
        if not med_col or not stock_col:
            raise RuntimeError("Stock query must return columns for medicine and quantity/current_stock.")
        df = df.rename(columns={med_col: "medicine", stock_col: "current_stock"})
        df["medicine"] = df["medicine"].astype(str).str.strip()
        df["current_stock"] = pd.to_numeric(df["current_stock"], errors="coerce").fillna(0.0).astype(float)
        return df
    finally:
        try: conn.close()
        except Exception: pass

def _clean_usage_df(df: pd.DataFrame) -> pd.DataFrame:
    def _norm_colname(s): return str(s).strip().lower().replace("_", " ")
    cols_map = {_norm_colname(c): c for c in df.columns}

    def pick(*cands):
        for c in cands:
            if c in cols_map: return cols_map[c]
        raise ValueError(f"Missing any of columns: {cands}")

    col_date = pick("date", "created at", "created_at", "dispensed at", "dispensed_at")
    col_med  = pick("medicine name", "medicine", "medicinename", "medicine_name")
    col_qty  = pick("qty", "quantity", "number", "amount", "change qty", "change_qty")

    df = df.rename(columns={col_date: "date", col_med: "medicine", col_qty: "qty"})
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date"]).copy()
    df["medicine"] = df["medicine"].astype(str).str.strip()
    df["qty"] = pd.to_numeric(df["qty"], errors="coerce").fillna(0.0).astype(float)
    df["qty"] = df["qty"].abs()
    df = df[df["medicine"] != ""].copy()
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
                if "created_at" in df.columns and "date" not in df.columns:
                    df = df.rename(columns={"created_at": "date"})
                cleaned = _clean_usage_df(df)
                if not cleaned.empty:
                    return cleaned
            except Exception:
                continue
        return pd.DataFrame(columns=["medicine", "date", "qty"])
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

    df["ym"] = df["date"].dt.to_period("M").to_timestamp()
    monthly = (df.groupby(["medicine","ym"], as_index=False)["qty"].sum()
                 .sort_values(["medicine","ym"]))
    if monthly.empty:
        today_m = pd.Timestamp.today().to_period("M").to_timestamp()
        return pd.DataFrame(columns=["medicine","ym","qty","month_idx"]), today_m

    min_ym: pd.Timestamp = monthly["ym"].min()
    monthly["month_idx"] = (
        (monthly["ym"].dt.year - min_ym.year) * 12
        + (monthly["ym"].dt.month - min_ym.month)
    ).astype(int)
    return monthly, min_ym

def _fit_linreg(x, y) -> Tuple[float, float]:
    if len(x) == 0: return 0.0, 0.0
    if len(x) == 1 or len(set(x)) == 1: return 0.0, float(np.mean(y))
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
        x = grp["month_idx"].values.astype(float)
        y = grp["qty"].values.astype(float)
        slope, intercept = _fit_linreg(x, y)
        for idx, ym in zip(future_idxs, future_yms):
            yhat = max(0.0, slope * idx + intercept)
            out.append({"medicine": str(med), "forecast_month": ym.strftime("%Y-%m"), "forecast_qty": float(yhat)})
    return sorted(out, key=lambda r: (r["medicine"], r["forecast_month"]))

def _aggregate_top_forecast(fc_rows: List[dict], metric: str = "total", top: Optional[int] = None) -> List[dict]:
    if not fc_rows: return []
    by_med: dict[str, List[dict]] = {}
    for r in fc_rows: by_med.setdefault(str(r["medicine"]), []).append(r)

    out = []
    for med, rows in by_med.items():
        rows = sorted(rows, key=lambda r: r["forecast_month"])
        qtys = [float(r["forecast_qty"]) for r in rows]
        months = [str(r["forecast_month"]) for r in rows]
        total = float(sum(qtys))
        next_m = float(qtys[0]) if qtys else 0.0
        avg = float(total / len(qtys)) if qtys else 0.0
        peak = float(max(qtys)) if qtys else 0.0
        if len(qtys) >= 2:
            x = np.arange(len(qtys), dtype=float)
            slope, _ = _fit_linreg(x, np.array(qtys, dtype=float))
        else:
            slope = 0.0
        out.append({
            "medicine": str(med),
            "total_forecast": total,
            "next_month_forecast": next_m,
            "avg_monthly_forecast": avg,
            "peak_month_forecast": peak,
            "horizon_months": len(qtys),
            "start_month": months[0] if months else None,
            "end_month": months[-1] if months else None,
            "trend_slope": float(slope),
        })
    key_map = {"total":"total_forecast","next":"next_month_forecast","avg":"avg_monthly_forecast","peak":"peak_month_forecast"}
    sort_key = key_map.get(str(metric).lower(), "total_forecast")
    out = sorted(out, key=lambda r: (-float(r[sort_key]), r["medicine"]))
    return out[:top] if (top is not None and top > 0) else out

# ---------------- Health ----------------

@app.get(f"{API_PREFIX}/health")
def health():
    dsn = "set" if bool(DATABASE_URL) else "missing"
    return ok({"status": "ok", "db": dsn, "driver": _DB_DRIVER})

# ---------------- Forecast (DB; stock-filtered) ----------------

@app.get(f"{API_PREFIX}/forecast_db")
def forecast_db(horizon: int = 6, include_all_stock: bool = True):
    """
    Per-month forecast over 'horizon' months, LIMITED to medicines in stock_inventory.
    If include_all_stock=true, items with no usage get zeros for each future month.
    """
    try:
        stock = _read_stock_df()
        stock_meds = stock["medicine"].astype(str).str.strip().tolist()
        stock_set = {m.casefold() for m in stock_meds}

        usage = _read_usage_df()
        if not usage.empty:
            usage = usage[usage["medicine"].str.casefold().isin(stock_set)].copy()
            usage["date"] = pd.to_datetime(usage["date"], errors="coerce")
            usage = usage.dropna(subset=["date"])

        monthly, min_ym = _monthly_aggregate(usage)
        out = _forecast_from_monthly(monthly, min_ym, int(horizon)) if not monthly.empty else []

        # Build month list for zero-padding
        if out:
            months = sorted({r["forecast_month"] for r in out})
        else:
            today = pd.Timestamp.today().normalize().to_period("M").to_timestamp()
            months = [(today + pd.DateOffset(months=i)).strftime("%Y-%m") for i in range(1, int(horizon) + 1)]

        if include_all_stock:
            have = {r["medicine"] for r in out}
            for med in stock_meds:
                if med not in have:
                    for fm in months:
                        out.append({"medicine": med, "forecast_month": fm, "forecast_qty": 0.0})

        out = sorted(out, key=lambda r: (r["medicine"], r["forecast_month"]))
        return ok(out)
    except Exception as e:
        return err("forecast_db_failed", 500, extra=str(e))

# ---------------- Top Forecast (DB) ----------------

@app.get(f"{API_PREFIX}/top_forecast_db")
def top_forecast_db(
    horizon: int = 6,
    top: Optional[int] = None,
    metric: str = "next",
    include_all_stock: bool = True,
):
    try:
        fc_rows = forecast_db.__wrapped__(horizon=horizon, include_all_stock=include_all_stock).body
        if isinstance(fc_rows, (bytes, bytearray)):
            import json as _json
            fc_rows = _json.loads(fc_rows)
        elif isinstance(fc_rows, dict) and "error" in fc_rows:
            return JSONResponse(content=fc_rows, status_code=500)

        if top is not None and top <= 0:
            top = None
        agg = _aggregate_top_forecast(fc_rows, metric=metric, top=top)
        return ok(agg)
    except Exception as e:
        return err("top_forecast_db_failed", 500, extra=str(e))

# ---------------- Seasonality (DB) ----------------

@app.get(f"{API_PREFIX}/seasonality_db")
def seasonality_db():
    try:
        stock = _read_stock_df()
        stock_set = {m.casefold() for m in stock["medicine"].astype(str).str.strip().tolist()}
        usage = _read_usage_df()
        usage = usage[usage["medicine"].str.casefold().isin(stock_set)].copy() if not usage.empty else usage
        if usage.empty:
            return ok([])

        usage["month"] = usage["date"].dt.month
        seasonal = usage.groupby(["medicine", "month"], as_index=False)["qty"].sum()
        peak = (
            seasonal.sort_values(["medicine", "qty", "month"], ascending=[True, False, True])
                    .groupby("medicine", as_index=False).first()
        )
        peak["peak_month_name"] = peak["month"].apply(lambda m: datetime(2000, int(m), 1).strftime("%B"))
        peak = peak.rename(columns={"qty": "peak_month_total"})
        out = []
        for _, r in peak.iterrows():
            out.append({
                "medicine": str(r["medicine"]),
                "month": int(r["month"]),
                "peak_month_total": float(r["peak_month_total"]),
                "peak_month_name": str(r["peak_month_name"]),
            })
        return ok(out)
    except Exception as e:
        return err("seasonality_db_failed", 500, extra=str(e))

# ---------------- Restock plan (DB) ----------------

@app.get(f"{API_PREFIX}/restock_db")
def restock_db(horizon: int = 6):
    try:
        stock = _read_stock_df()
        stock_map = {str(r["medicine"]).strip().casefold(): float(r["current_stock"]) for _, r in stock.iterrows()}

        fc_rows = forecast_db.__wrapped__(horizon=horizon, include_all_stock=True).body
        if isinstance(fc_rows, (bytes, bytearray)):
            import json as _json
            fc_rows = _json.loads(fc_rows)
        elif isinstance(fc_rows, dict) and "error" in fc_rows:
            return JSONResponse(content=fc_rows, status_code=500)

        if not fc_rows:
            return ok([])

        first_month = sorted({row["forecast_month"] for row in fc_rows})[0]
        by_med = {}
        for row in fc_rows:
            by_med.setdefault(row["medicine"], []).append(row)

        plan = []
        for med, rows in by_med.items():
            rows = sorted(rows, key=lambda r: r["forecast_month"])
            cur = float(stock_map.get(str(med).casefold(), 0.0))
            nmf = next((float(r["forecast_qty"]) for r in rows if r["forecast_month"] == first_month), 0.0)

            cum = 0.0
            restock_month = None
            months_to_stockout: Optional[int] = None
            for i, r in enumerate(rows):
                cum += float(r["forecast_qty"])
                if cum > cur:
                    restock_month = str(r["forecast_month"])
                    months_to_stockout = int(i + 1)
                    break

            plan.append({
                "medicine": str(med),
                "current_stock": float(cur),
                "next_month_forecast": float(nmf),
                "restock_month": restock_month if restock_month else None,
                "months_to_stockout": months_to_stockout
            })

        plan = sorted(plan, key=lambda r: (r["months_to_stockout"] or 10**9, r["medicine"]))
        return ok(plan)
    except Exception as e:
        return err("restock_db_failed", 500, extra=str(e))

# ---------------- File-based endpoints (optional) ----------------

def _read_usage_from_upload(upload: UploadFile) -> pd.DataFrame:
    content = upload.file.read()
    try:
        df = pd.read_excel(io.BytesIO(content))
    except Exception:
        df = pd.read_csv(io.BytesIO(content))
    c = {str(x).strip().lower().replace("_"," "): x for x in df.columns}
    med_col  = c.get("medicine name") or c.get("medicine") or c.get("medicinename")
    qty_col  = c.get("qty") or c.get("quantity") or c.get("amount") or c.get("number") or c.get("change qty") or c.get("change_qty")
    date_col = c.get("date") or c.get("created at") or c.get("created_at") or c.get("dispensed at") or c.get("dispensed_at")
    if not (med_col and qty_col and date_col):
        raise ValueError("Upload must include medicine/qty/date columns")
    df = df.rename(columns={med_col:"medicine", qty_col:"qty", date_col:"date"})
    return _clean_usage_df(df)

def _read_csv_frame(upload: UploadFile, expected_cols: list[str]) -> pd.DataFrame:
    content = upload.file.read()
    df = pd.read_csv(io.BytesIO(content))
    have = {c.strip().lower(): c for c in df.columns}
    miss = [c for c in expected_cols if c not in have]
    if miss:
        raise ValueError(f"Missing columns in CSV: {miss}")
    return df.rename(columns={have[c]: c for c in expected_cols})

@app.post(f"{API_PREFIX}/forecast")
def forecast_file(horizon: int = Form(6), file: UploadFile = File(...)):
    try:
        usage = _read_usage_from_upload(file)
        monthly, min_ym = _monthly_aggregate(usage)
        out = _forecast_from_monthly(monthly, min_ym, int(horizon)) if not monthly.empty else []
        out = sorted(out, key=lambda r: (r["medicine"], r["forecast_month"]))
        return ok(out)
    except Exception as e:
        return err("forecast_file_failed", 400, extra=str(e))

@app.post(f"{API_PREFIX}/top_forecast")
def top_forecast_file(metric: str = Form("total"), horizon: int = Form(6), top: Optional[int] = Form(None), file: UploadFile = File(...)):
    try:
        usage = _read_usage_from_upload(file)
        monthly, min_ym = _monthly_aggregate(usage)
        fc_rows = _forecast_from_monthly(monthly, min_ym, int(horizon)) if not monthly.empty else []
        agg = _aggregate_top_forecast(fc_rows, metric=metric, top=(None if (top is not None and int(top) <= 0) else top))
        return ok(agg)
    except Exception as e:
        return err("top_forecast_file_failed", 400, extra=str(e))

@app.post(f"{API_PREFIX}/seasonality")
def seasonality_file(file: UploadFile = File(...)):
    try:
        usage = _read_usage_from_upload(file)
        if usage.empty:
            return ok([])
        usage["month"] = usage["date"].dt.month
        seasonal = usage.groupby(["medicine", "month"], as_index=False)["qty"].sum()
        peak = (seasonal.sort_values(["medicine","qty","month"], ascending=[True,False,True])
                        .groupby("medicine", as_index=False).first())
        peak["peak_month_name"] = peak["month"].apply(lambda m: datetime(2000, int(m), 1).strftime("%B"))
        peak = peak.rename(columns={"qty": "peak_month_total"})
        out = [{
            "medicine": str(r["medicine"]),
            "month": int(r["month"]),
            "peak_month_total": float(r["peak_month_total"]),
            "peak_month_name": str(r["peak_month_name"]),
        } for _, r in peak.iterrows()]
        return ok(out)
    except Exception as e:
        return err("seasonality_file_failed", 400, extra=str(e))

@app.post(f"{API_PREFIX}/restock")
def restock_file(
    forecast_csv: UploadFile = File(...),   # columns: medicine,forecast_month,forecast_qty
    current_stock_csv: UploadFile = File(...),  # columns: medicine,current_stock
):
    try:
        fdf = _read_csv_frame(forecast_csv, ["medicine","forecast_month","forecast_qty"])
        cdf = _read_csv_frame(current_stock_csv, ["medicine","current_stock"])
        fdf["medicine"] = fdf["medicine"].astype(str).str.strip()
        cdf["medicine"] = cdf["medicine"].astype(str).str.strip()
        fdf["forecast_qty"] = pd.to_numeric(fdf["forecast_qty"], errors="coerce").fillna(0.0)
        cdf["current_stock"] = pd.to_numeric(cdf["current_stock"], errors="coerce").fillna(0.0)
        months = sorted(fdf["forecast_month"].unique().tolist())
        first_month = months[0] if months else None

        plan = []
        for med, g in fdf.groupby("medicine"):
            g = g.sort_values("forecast_month")
            cur = float(cdf.loc[cdf["medicine"].str.casefold()==med.casefold(), "current_stock"].sum())
            nmf = float(g.loc[g["forecast_month"]==first_month, "forecast_qty"].sum()) if first_month else 0.0
            cum = 0.0; restock_month = None; months_to_stockout = None
            for i, r in enumerate(g.itertuples(index=False)):
                cum += float(r.forecast_qty)
                if cum > cur:
                    restock_month = r.forecast_month; months_to_stockout = int(i + 1); break
            plan.append({
                "medicine": med,
                "current_stock": float(cur),
                "next_month_forecast": float(nmf),
                "restock_month": restock_month,
                "months_to_stockout": months_to_stockout
            })
        plan = sorted(plan, key=lambda r: (r["months_to_stockout"] or 10**9, r["medicine"]))
        return ok(plan)
    except Exception as e:
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
