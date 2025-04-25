import 'dotenv/config';

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { connectToMongoDB } from "./mongo.js";
import { createServer } from "./server.js";
import { MongoClient } from "mongodb";
import { printWelcomeBanner } from "./utils/banner.js";

// 声明一个全局作用域的客户端变量用于清理处理
let mongoClient: MongoClient | null = null;
// let serverInfo: { server: any; cleanup: () => void } | null = null;

/**
 * 使用stdio传输启动服务器并初始化MongoDB连接
 */
// 修改 index.ts 文件中的 main 函数
async function main() {
  // printWelcomeBanner();

  const args = process.argv.slice(2);
  // 默认使用环境变量
  let connectionUrl = process.env.MCP_MONGODB_URI || "";
  let readOnlyMode = process.env.MCP_MONGODB_READONLY === "true" || false;
  let useMemory = process.env.VITEA_USE_MEMORY === "true" || false;

  // 解析命令行参数（这些优先）
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--read-only" || args[i] === "-r") {
      readOnlyMode = true;
    } else if (args[i] === "--use-memory" || args[i] === "-m") {
      useMemory = true;
    } else if (!connectionUrl) {
      connectionUrl = args[i];
    }
  }

  // 如果命令行中没有连接URL，则使用环境变量
  if (!connectionUrl) {
    connectionUrl = process.env.MCP_MONGODB_URI || "";
  }

  if (!connectionUrl) {
    console.error(
      "请通过命令行参数或MCP_MONGODB_URI环境变量提供MongoDB连接URL"
    );
    console.error(
      "用法: command <mongodb-url> [--read-only|-r] [--use-memory|-m]"
    );
    console.error(
      "   或: MCP_MONGODB_URI=<mongodb-url> [MCP_MONGODB_READONLY=true] [VITEA_USE_MEMORY=true] command"
    );
    process.exit(1);
  }

  // 确保连接URL有正确的前缀
  if (
    !connectionUrl.startsWith("mongodb://") &&
    !connectionUrl.startsWith("mongodb+srv://")
  ) {
    console.error(
      "无效的MongoDB连接URL。URL必须以'mongodb://'或'mongodb+srv://'开头"
    );
    process.exit(1);
  }

  try {
    const { client, db, isConnected, isReadOnlyMode } = await connectToMongoDB(
      connectionUrl,
      readOnlyMode
    );

    // 将客户端存储在全局变量中以便清理
    mongoClient = client;

    if (!isConnected || !client || !db) {
      console.error("连接到MongoDB失败");
      process.exit(1);
    }

    console.warn(`已连接到数据库: ${db.databaseName}`);
    console.warn(`读取模式: ${isReadOnlyMode ? "只读" : "读写"}`);
    console.warn(`记忆系统: ${useMemory ? "启用" : "禁用"}`);

    // 创建服务器
    const server = createServer(client, db, isReadOnlyMode, {
      useMemory,
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.warn("ViteaOS MCP服务器已成功连接");
  } catch (error) {
    console.error("连接到MongoDB失败:", error);
    if (mongoClient) {
      await mongoClient.close();
    }
    process.exit(1);
  }
}

// 清理处理代码保持原样，不使用 serverInfo
process.on("SIGINT", async () => {
  if (mongoClient) {
    await mongoClient.close();
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  if (mongoClient) {
    await mongoClient.close();
  }
  process.exit(0);
});

main().catch((error) => {
  console.error("服务器错误:", error);
  process.exit(1);
});
