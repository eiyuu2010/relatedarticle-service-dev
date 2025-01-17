/** @format */

const handleError = (error, errorCode, source, details = {}) => {
  console.error(`Error: ${errorCode}`, error);

  return {
    statusCode: 500,
    headers: {
      "Access-Control-Allow-Origin": "*", // hoặc 'http://localhost:3000'
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-Amz-Date, X-Api-Key, X-Amz-Security-Token, X-Amz-User-Agent",
      "Access-Control-Allow-Credentials": "true",
    },
    body: JSON.stringify({
      errorCode,
      message: error.message || "Unknown error",
      source,
      details,
      stack: error.stack || "No stack trace available",
      timestamp: new Date().toISOString(),
    }),
  };
};

module.exports = handleError;
