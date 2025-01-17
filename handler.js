/** @format */

const { v4: uuidv4 } = require("uuid");
const zlib = require("zlib");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
  ScanCommand,
  GetCommand,
  DeleteCommand,
  QueryCommand,
} = require("@aws-sdk/lib-dynamodb");
const createRedisClient = require("./redisClient");
const handleError = require("./errorHandler");
const { sendSlackNotification } = require("./slackNotifer");
const client = new DynamoDBClient();
const ddbDocClient = DynamoDBDocumentClient.from(client);
// Sử dụng Relatedarticle cho tên bảng động
const tableName = process.env.DYNAMODB_TABLE; // Tên bảng từ môi trường

// Thêm Relatedarticle mới
module.exports.addRelatedarticle = async (event) => {
  const {
    relatedarticleApp,
    relatedarticleTitle,
    relatedarticlePosition,
    relatedarticleShowThumbnail,
    relatedarticleLinkHoverColor,
    relatedarticleTextColor,
    relatedarticleBackgroudColor,
    relatedarticleStatus,
    relatedarticleContent,
  } = JSON.parse(event.body);

  const currentDate = new Date().toISOString(); // Lấy thời gian hiện tại làm Sort Key
  const relatedarticleId = uuidv4(); // Tạo giá trị duy nhất cho relatedarticleId

  const relatedarticle = {
    defaultSearch: "all", // Partition Key cố định
    createdDate: currentDate, // Sort Key
    relatedarticleId, // Giá trị duy nhất cho GSI
    relatedarticleApp,
    relatedarticleTitle,
    relatedarticlePosition,
    relatedarticleShowThumbnail,
    relatedarticleLinkHoverColor,
    relatedarticleTextColor,
    relatedarticleBackgroudColor,
    relatedarticleStatus,
    relatedarticleContent,
  };

  const params = {
    TableName: tableName,
    Item: relatedarticle,
  };

  // Redis cache handling (giữ nguyên comment nếu cần)
  // const redisClient = createRedisClient();

  try {
    await ddbDocClient.send(new PutCommand(params));

    // Xử lý Redis cache (giữ nguyên comment nếu cần)
    // try {
    //   const pattern = 'allRelatedarticles:*';
    //   const keys = await redisClient.keys(pattern);
    //   if (keys.length > 0) {
    //     for (const key of keys) {
    //       await redisClient.del(key);
    //     }
    //   }
    // } catch (deleteRedisError) {
    //   console.error(
    //     'Error deleting Relatedarticle from Redis cache:',
    //     deleteRedisError
    //   );
    // }

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*", // hoặc domain của bạn
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Credentials": "true",
      },
      body: JSON.stringify(relatedarticle),
    };
  } catch (err) {
    console.error("Error adding Attribute:", err);
    return handleError(err, "DYNAMODB_ERROR", "DynamoDB", {
      action: "PutCommand",
      params,
    });
  }
};

// Cập nhật Relatedarticle
module.exports.updateRelatedarticle = async (event) => {
  const { id } = event.pathParameters; // Lấy `relatedarticleId` từ URL
  const updates = JSON.parse(event.body);

  // Chuẩn bị các trường cần cập nhật
  const updateFields = {};
  const expressionAttributeValues = {};
  const expressionAttributeNames = {};

  Object.entries(updates).forEach(([key, value]) => {
    if (typeof value !== "undefined") {
      updateFields[`#${key}`] = `:${key}`;
      expressionAttributeValues[`:${key}`] = value;
      expressionAttributeNames[`#${key}`] = key;
    }
  });

  // Kiểm tra nếu không có gì để cập nhật
  if (Object.keys(updateFields).length === 0) {
    return {
      statusCode: 400,
      headers: {
        "Access-Control-Allow-Origin": "*", // hoặc domain của bạn
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Credentials": "true",
      },
      body: JSON.stringify({ message: "No fields to update" }),
    };
  }

  const updateExpression =
    "SET " +
    Object.entries(updateFields)
      .map(([key, value]) => `${key} = ${value}`)
      .join(", ");

  try {
    // Step 1: Query item using relatedarticleId-index
    const queryParams = {
      TableName: tableName,
      IndexName: "relatedarticleId-index", // Sử dụng đúng GSI
      KeyConditionExpression: "relatedarticleId = :id",
      ExpressionAttributeValues: {
        ":id": id,
      },
    };

    const queryResult = await ddbDocClient.send(new QueryCommand(queryParams));

    if (!queryResult.Items || queryResult.Items.length === 0) {
      return {
        statusCode: 404,
        headers: {
          "Access-Control-Allow-Origin": "*", // hoặc domain của bạn
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Allow-Credentials": "true",
        },
        body: JSON.stringify({ message: "Item not found" }),
      };
    }

    // Step 2: Get the item's primary key
    const itemToUpdate = queryResult.Items[0];
    const { defaultSearch, createdDate } = itemToUpdate;

    if (!defaultSearch || !createdDate) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*", // hoặc domain của bạn
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Allow-Credentials": "true",
        },
        body: JSON.stringify({
          message: "Invalid primary key data. Cannot update item.",
        }),
      };
    }

    // Step 3: Perform the update using primary key
    const updateParams = {
      TableName: tableName,
      Key: {
        defaultSearch, // Partition Key
        createdDate, // Sort Key
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ExpressionAttributeNames: expressionAttributeNames,
      ReturnValues: "ALL_NEW", // Trả về dữ liệu sau khi cập nhật
    };

    const updateResult = await ddbDocClient.send(
      new UpdateCommand(updateParams)
    );

    // Redis cache handling (giữ nguyên comment)
    // const redisClient = createRedisClient();
    // try {
    //   await redisClient.del(`Relatedarticle:${id}`);
    //   const pattern = 'allRelatedarticles:*';
    //   const keys = await redisClient.keys(pattern);

    //   if (keys.length > 0) {
    //     for (const key of keys) {
    //       await redisClient.del(key);
    //     }
    //   }
    // } catch (deleteError) {
    //   console.error('Error deleting Relatedarticle from Redis cache:', deleteError);
    // }

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*", // hoặc domain của bạn
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Credentials": "true",
      },
      body: JSON.stringify(updateResult.Attributes),
    };
  } catch (err) {
    console.error("Error updating item:", err);
    return handleError(err, "DYNAMODB_ERROR", "DynamoDB", {
      action: "UpdateCommand",
      updateFields,
    });
  }
};

// Tạo cacheKey với encodeURIComponent cho từng query param
const createCacheKey = (queryParams, page, pageLimit, sort) => {
  const keys = Object.keys(queryParams)
    .map((key) => {
      const encodedValue = encodeURIComponent(queryParams[key]);
      return `${key}:${encodedValue}`;
    })
    .join("|"); // Sử dụng dấu '|' để phân cách các cặp key-value

  return `allRelatedarticles:query:${keys}:page:${page}:limit:${pageLimit}:sort:${sort}`;
};

// Lấy tất cả Relatedarticle

module.exports.getAllRelatedarticles = async (event) => {
  // Trích xuất các query parameters (nếu có)
  const queryParams = event.queryStringParameters || {};
  const pageLimit = queryParams.limit ? parseInt(queryParams.limit) : 10;
  const page = queryParams.currentPage ? parseInt(queryParams.currentPage) : 1;
  const sortField = queryParams.sortField || "createdDate"; // Default sort field
  const sortOrder = queryParams.sortOrder || "desc"; // Default sort order

  const partitionKeyValue = "all"; // Fixed value for defaultSearch

  // const redisClient = createRedisClient();
  // const cacheKey = createCacheKey(queryParams, page, pageLimit, sort);

  // Kiểm tra cache trước
  // try {
  //   const cachedResults = await redisClient.get(cacheKey);
  //   if (cachedResults) {
  //     return {
  //       statusCode: 200,
  //       body: cachedResults,
  //     };
  //   }
  // } catch (redisError) {
  //   console.error('Error getting Relatedarticle from Redis cache:', redisError);
  // }

  // Chuẩn bị các điều kiện tìm kiếm động từ query params
  let filterExpressions = [];
  let expressionAttributeNames = {};
  let expressionAttributeValues = {};

  // Fuzzy search on `name`

  // Filter by relatedarticleApp
  if (
    queryParams.relatedarticleApp &&
    queryParams.relatedarticleApp.trim() !== ""
  ) {
    const filterName = "#relatedarticleApp";
    const filterValue = ":relatedarticleApp";
    filterExpressions.push(`${filterName} = ${filterValue}`);
    expressionAttributeNames[filterName] = "relatedarticleApp";
    expressionAttributeValues[filterValue] = queryParams.relatedarticleApp;
  }
  // Filter by relatedarticleStatus
  if (
    queryParams.relatedarticleStatus &&
    queryParams.relatedarticleStatus.trim() !== ""
  ) {
    const filterName = "#relatedarticleStatus";
    const filterValue = ":relatedarticleStatus";
    filterExpressions.push(`${filterName} = ${filterValue}`);
    expressionAttributeNames[filterName] = "relatedarticleStatus";
    expressionAttributeValues[filterValue] = queryParams.relatedarticleStatus;
  }

  // Prepare Query Parameters
  const params = {
    TableName: tableName,
    KeyConditionExpression: "#defaultSearch = :defaultSearch",
    ExpressionAttributeNames: {
      "#defaultSearch": "defaultSearch",
    },
    ExpressionAttributeValues: {
      ":defaultSearch": partitionKeyValue,
    },
    Limit: pageLimit,
    ScanIndexForward: sortOrder === "asc", // Set ScanIndexForward based on sortOrder
  };

  // Combine FilterExpression if there are filters
  if (filterExpressions.length > 0) {
    params.FilterExpression = filterExpressions.join(" AND ");
    params.ExpressionAttributeNames = {
      ...params.ExpressionAttributeNames, // Giữ các thuộc tính đã có
      ...expressionAttributeNames, // Thêm các thuộc tính từ filterExpressions
    };
    params.ExpressionAttributeValues = {
      ...params.ExpressionAttributeValues, // Giữ các giá trị đã có
      ...expressionAttributeValues, // Thêm các giá trị từ filterExpressions
    };
  }

  let exclusiveStartKey = null;

  if (page > 1) {
    let itemsToSkip = (page - 1) * pageLimit;
    let lastEvaluatedKey = null;

    while (itemsToSkip > 0) {
      const tempParams = {
        ...params,
        Limit: Math.min(itemsToSkip, 1000),
        ExclusiveStartKey: lastEvaluatedKey || undefined, // Ensure valid ExclusiveStartKey
      };

      const tempResult = await ddbDocClient.send(new QueryCommand(tempParams));

      if (!tempResult.Items || tempResult.Items.length === 0) {
        break; // No items to process
      }

      itemsToSkip -= tempResult.Items.length;
      lastEvaluatedKey = tempResult.LastEvaluatedKey;

      if (!lastEvaluatedKey) {
        break; // No more data
      }
    }

    exclusiveStartKey = lastEvaluatedKey;
  }

  if (exclusiveStartKey) {
    params.ExclusiveStartKey = exclusiveStartKey;
  }

  try {
    // Fetch the data
    const result = await ddbDocClient.send(new QueryCommand(params));

    // Calculate total items and total pages
    const totalScanParams = {
      TableName: tableName,
      Select: "COUNT",
    };

    if (filterExpressions.length > 0) {
      totalScanParams.FilterExpression = filterExpressions.join(" AND ");
      totalScanParams.ExpressionAttributeNames = {
        ...expressionAttributeNames,
      };
      totalScanParams.ExpressionAttributeValues = {
        ...expressionAttributeValues,
      };
    }

    const totalResult = await ddbDocClient.send(
      new ScanCommand(totalScanParams)
    );
    const totalItems = totalResult.Count;
    const totalPages = Math.ceil(totalItems / pageLimit);

    // Prepare the response
    const responseData = {
      items: result.Items || [],
      lastKey: result.LastEvaluatedKey
        ? JSON.stringify(result.LastEvaluatedKey)
        : null,
      totalItems,
      totalPages,
      currentPage: page,
    };
    // Lưu vào cache
    // try {
    //   await redisClient.set(cacheKey, JSON.stringify(responseData), {
    //     EX: 3600,
    //   });
    // } catch (redisSetError) {
    //   console.error('Error saving Relatedarticle to Redis cache:', redisSetError);
    // }
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Credentials": "true",
      },
      body: JSON.stringify(responseData),
    };
  } catch (error) {
    console.error("Error fetching items: ", error);
    return handleError(error, "DYNAMODB_ERROR", "DynamoDB", {
      action: "QueryCommand",
      params,
    });
  }
};

// Lấy Relatedarticle theo ID
module.exports.getRelatedarticleById = async (event) => {
  const { id } = event.pathParameters;
  // const redisClient = createRedisClient();

  // try {
  //   const cachedRelatedarticle = await redisClient.get(`Relatedarticle:${id}`);
  //   if (cachedRelatedarticle) {
  //     return {
  //       statusCode: 200,
  //       body: cachedRelatedarticle,
  //     };
  //   }
  // } catch (redisError) {
  //   console.error('Error getting Relatedarticle from Redis cache:', redisError);
  // }

  try {
    const params = {
      TableName: tableName,
      IndexName: "relatedarticleId-index", // Sử dụng đúng tên GSI
      KeyConditionExpression: "relatedarticleId = :id", // Điều kiện truy vấn
      ExpressionAttributeValues: {
        ":id": id, // Giá trị của `relatedarticleId`
      },
    };

    const result = await ddbDocClient.send(new QueryCommand(params));
    console.log("result", result);
    if (!result.Items || result.Items.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Relatedarticle not found" }),
      };
    }

    // try {
    //   await redisClient.set(`Relatedarticle:${id}`, JSON.stringify(result.Items[0]), {
    //     EX: 3600,
    //   });
    // } catch (redisSetError) {
    //   console.error('Error saving Relatedarticle to Redis cache:', redisSetError);
    // }

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*", // hoặc '*'
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-Amz-Date, X-Api-Key, X-Amz-Security-Token, X-Amz-User-Agent",
        "Access-Control-Allow-Credentials": "true",
      },
      body: JSON.stringify(result.Items[0]),
    };
  } catch (err) {
    console.error("Error getting Attribute from DynamoDB or Redis:", err);
    return handleError(err, "DYNAMODB_ERROR", "DynamoDB", {
      action: "Fetching Relatedarticle from DynamoDB",
      relatedarticleId: id,
    });
  }
};

// Xóa Relatedarticle
module.exports.deleteRelatedarticle = async (event) => {
  const { id } = event.pathParameters;
  // const redisClient = createRedisClient();
  try {
    // Query item using relatedarticleId-index
    const queryParams = {
      TableName: tableName,
      IndexName: "relatedarticleId-index", // Sử dụng GSI
      KeyConditionExpression: "relatedarticleId = :id",
      ExpressionAttributeValues: {
        ":id": id,
      },
    };

    const queryResult = await ddbDocClient.send(new QueryCommand(queryParams));

    if (!queryResult.Items || queryResult.Items.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Relatedarticle not found" }),
      };
    }

    // Get the primary key of the item
    const itemToDelete = queryResult.Items[0];

    // Delete the item using Primary Key with a ConditionExpression
    const deleteParams = {
      TableName: tableName,
      Key: {
        defaultSearch: itemToDelete.defaultSearch, // Partition Key
        createdDate: itemToDelete.createdDate, // Sort Key
      },
      ConditionExpression: "relatedarticleId = :id", // Ensure item matches
      ExpressionAttributeValues: {
        ":id": id,
      },
    };

    await ddbDocClient.send(new DeleteCommand(deleteParams));

    // try {
    //   await redisClient.del(`Relatedarticle:${id}`);
    //   const pattern = 'allRelatedarticles:*';
    //   const keys = await redisClient.keys(pattern);
    //   if (keys.length > 0) {
    //     console.log(
    //       `Deleting ${keys.length} cache keys related to all Relatedarticles`
    //     );
    //     for (const key of keys) {
    //       await redisClient.del(key);
    //     }
    //   }
    // } catch (deleteError) {
    //   console.error('Error deleting Relatedarticle from Redis cache:', deleteError);
    // }

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*", // hoặc 'http://localhost:3000'
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-Amz-Date, X-Api-Key, X-Amz-Security-Token, X-Amz-User-Agent",
        "Access-Control-Allow-Credentials": "true",
      },
      body: JSON.stringify({ message: "Relatedarticle deleted successfully" }),
    };
  } catch (err) {
    console.error("Error deleting Relatedarticle:", err);
    return handleError(err, "DYNAMODB_ERROR", "DynamoDB", {
      action: "DeleteCommand",
      relatedarticleId: id,
    });
  }
};

// Hàm Lambda để xử lý sự kiện log và gửi thông báo lên Slack
module.exports.notifySlackOnError = async (event) => {
  const logMessage = event.awslogs.data;

  // Giải mã gzip log từ CloudWatch logs
  const decodedLogMessage = Buffer.from(logMessage, "base64");
  const unzippedLogMessage = zlib
    .gunzipSync(decodedLogMessage)
    .toString("utf-8");

  try {
    const parsedLog = JSON.parse(unzippedLogMessage);

    // Lọc ra lỗi (ERROR) từ CloudWatch logs
    const errorMessages = parsedLog.logEvents
      .filter((logEvent) => logEvent.message.includes("ERROR"))
      .map((logEvent) => {
        return logEvent.message;
      });

    console.log("errorMessages", errorMessages);

    // Nếu có lỗi, gửi lên Slack với định dạng đẹp
    if (errorMessages.length > 0) {
      for (const errorMessage of errorMessages) {
        await sendSlackNotification(errorMessage);
      }
    }
  } catch (error) {
    console.error("Error notifying Slack:", error);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Notification sent to Slack." }),
  };
};
