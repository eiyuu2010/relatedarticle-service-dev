/** @format */

const axios = require("axios");

// Hàm định dạng lỗi cho Slack
const formatSlackMessage = (logMessage) => {
  try {
    // Tách các dòng log dựa trên dấu tab để lấy các phần tử
    const lines = logMessage.split("\t");

    // Kiểm tra xem có ít nhất 4 phần tử hay không (timestamp, requestId, log level, message)
    if (lines.length < 4) {
      throw new Error("Log message format is invalid");
    }

    // Bóc tách từng phần
    const timestamp = lines[0]; // Phần timestamp
    const requestId = lines[1]; // ID của request để theo dõi log
    const logLevel = lines[2]; // Mức độ log (INFO, ERROR)
    const errorDetail = lines.slice(3).join("\n"); // Chi tiết lỗi bắt đầu từ phần tử thứ 4

    // Format thông báo lỗi để gửi lên Slack
    return `
*Timestamp*: ${timestamp}
*Request ID*: ${requestId}
*Log Level*: ${logLevel}
*Details*:
\`\`\`
${errorDetail}
\`\`\`
    `;
  } catch (error) {
    console.error("Error formatting Slack message:", error);
    return `Error formatting message: ${logMessage}`;
  }
};

module.exports = { formatSlackMessage };

// Gửi thông báo lỗi lên Slack
const sendSlackNotification = async (errorLog) => {
  try {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;

    // Gọi hàm định dạng tin nhắn
    const message = formatSlackMessage(errorLog);

    await axios.post(webhookUrl, {
      text: message, // Sử dụng định dạng Markdown
    });
  } catch (error) {
    console.error("Error sending Slack notification:", error.message);
  }
};

module.exports = {
  sendSlackNotification,
  formatSlackMessage,
};
