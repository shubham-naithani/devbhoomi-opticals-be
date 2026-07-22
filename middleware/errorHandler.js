const { logError } = require("../utils/errorLogger");

// Converts Mongoose/validation/duplicate-key errors into clean JSON responses
function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Something went wrong on the server";

  if (err.name === "MongoServerSelectionError" || err.name === "MongooseServerSelectionError") {
    statusCode = 503;
    message = "Database unavailable. Please check your MongoDB Atlas connection.";
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    statusCode = 400;
    message = Object.values(err.errors).map((e) => e.message).join(", ");
  }

  // Mongoose bad ObjectId
  if (err.name === "CastError") {
    statusCode = 400;
    message = `Invalid value for ${err.path}`;
  }

  // Duplicate key (e.g. email already exists)
  if (err.code === 11000) {
    statusCode = 400;
    const field = Object.keys(err.keyValue || {})[0];
    message = `${field} already exists`;
  }

  // Only log genuinely unexpected failures — anything still a 5xx after
  // all the remapping above. Deliberate 4xx errors (validation, business
  // rules your controllers throw on purpose) are normal operation, not
  // incidents — they shouldn't clutter the error log or trigger an alert.
  if (statusCode >= 500) {
    logError({
      source: "backend",
      severity: "critical",
      message: err.message || message,
      stack: err.stack,
      route: req.originalUrl,
      method: req.method,
      statusCode,
      user: req.user,
    }).catch(() => {});
  }

  res.status(statusCode).json({ message });
}

function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.originalUrl}` });
}

module.exports = { errorHandler, notFound };