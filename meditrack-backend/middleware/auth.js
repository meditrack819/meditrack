const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader) {
      return res.status(401).json({ error: "Authorization header missing" });
    }

    // Expect "Bearer <token>"
    const [scheme, token] = authHeader.split(" ");
    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({ error: "Invalid authorization format" });
    }

    // Verify token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "supersecret"
    );

    // Attach user payload
    req.user = decoded;
    next();
  } catch (err) {
    console.error("❌ Auth error:", err.message);

    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" });
    }
    return res.status(403).json({ error: "Invalid token" });
  }
}

module.exports = { requireAuth };
