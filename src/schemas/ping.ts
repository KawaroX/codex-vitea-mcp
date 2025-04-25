import type { PingRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Db, MongoClient } from "mongodb";

/**
 * 处理Ping请求
 * 用于检查服务器健康状态
 */
export async function handlePingRequest({
  request,
  client,
  db,
  isReadOnlyMode,
  useMemory,
}: {
  request: PingRequest;
  client: MongoClient;
  db: Db;
  isReadOnlyMode: boolean;
  useMemory: boolean;
}) {
  try {
    // 检查MongoDB连接
    if (!client) {
      throw new Error("MongoDB连接不可用");
    }

    // Ping MongoDB以验证连接
    const pong = await db.command({ ping: 1 });

    if (pong.ok !== 1) {
      throw new Error(`MongoDB ping失败: ${pong.errmsg}`);
    }

    // 检查ViteaOS的核心集合
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map((c) => c.name);

    const requiredCollections = [
      "items",
      "locations",
      "contacts",
      "bioData",
      "tasks",
    ];
    const missingCollections = requiredCollections.filter(
      (name) => !collectionNames.includes(name)
    );

    if (missingCollections.length > 0) {
      console.warn(
        `警告: 缺少以下ViteaOS集合: ${missingCollections.join(", ")}`
      );
    }
    // 添加Memory系统状态信息
    let memoryStats = null;
    if (useMemory) {
      // 查询Memory集合的一些基本统计信息
      const memoriesCollection = db.collection("memories");
      const totalCount = await memoriesCollection.countDocuments();
      const expiredCount = await memoriesCollection.countDocuments({
        "classification.expiresAt": { $lt: new Date() },
      });

      memoryStats = {
        enabled: true,
        totalCount,
        expiredCount,
      };
    }

    return {
      vitea: {
        version: "0.2.0",
        mode: isReadOnlyMode ? "只读" : "读写",
        memory: memoryStats || { enabled: false },
        collections: {
          total: collections.length,
          vitea: requiredCollections.filter((name) =>
            collectionNames.includes(name)
          ).length,
          missing: missingCollections,
        },
      },
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`MongoDB ping失败: ${error.message}`);
    }
    throw new Error("MongoDB ping失败: 未知错误");
  }
}
