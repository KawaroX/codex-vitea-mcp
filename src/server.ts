import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourceTemplatesRequestSchema,
  PingRequestSchema,
  CompleteRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  handleReadResourceRequest,
  handleListResourcesRequest,
} from "./schemas/resource.js";
import { handlePingRequest } from "./schemas/ping.js";
import { handleListToolsRequest } from "./schemas/tools.js";
import {
  handleListPromptsRequest,
  handleGetPromptRequest,
} from "./schemas/prompts.js";
import { handleCallToolRequest } from "./schemas/call.js";
import { handleCallToolRequestWithMemory } from "./schemas/call.js";
import { handleListResourceTemplatesRequest } from "./schemas/templates.js";
import { handleCompletionRequest } from "./schemas/completion.js";
import { SchedulerManager } from "./utils/scheduler.js";
import type { Db, MongoClient } from "mongodb";

/**
 * 创建支持资源（列举/读取集合）、工具（查询数据）和提示（分析集合）
 * 的MCP服务器
 */
export function createServer(
  client: MongoClient,
  db: Db,
  isReadOnlyMode = false,
  options = {
    useMemory: false,
  }
) {
  // 是否启用 Memory 系统
  const useMemory = options.useMemory === true;

  // 创建定时任务管理器
  let schedulerManager: SchedulerManager | null = null;
  if (useMemory) {
    schedulerManager = new SchedulerManager(db);
    schedulerManager.startSchedulers();

    // 注册进程退出事件来清理
    process.on("beforeExit", () => {
      if (schedulerManager) {
        schedulerManager.stopSchedulers();
      }
    });
  }

  const server = new Server(
    {
      name: "codex-vitea-mcp",
      version: "0.2.0",
      ...options,
    },
    {
      capabilities: {
        resources: {}, // 支持集合作为资源
        tools: {}, // 支持查询工具
        prompts: {}, // 支持分析提示
      },
      ...options,
    }
  );

  /**
   * Ping请求处理器，用于检查服务器健康状况
   */
  server.setRequestHandler(PingRequestSchema, (request) =>
    handlePingRequest({ request, client, db, isReadOnlyMode, useMemory })
  );

  /**
   * 列出可用集合作为资源的处理器
   */
  server.setRequestHandler(ListResourcesRequestSchema, (request) =>
    handleListResourcesRequest({ request, client, db, isReadOnlyMode })
  );

  /**
   * 读取集合模式或内容的处理器
   */
  server.setRequestHandler(ReadResourceRequestSchema, (request) =>
    handleReadResourceRequest({ request, client, db, isReadOnlyMode })
  );

  /**
   * 列出可用工具的处理器
   */
  server.setRequestHandler(ListToolsRequestSchema, (request) =>
    handleListToolsRequest({
      request,
      client,
      db,
      isReadOnlyMode,
      useMemory,
    })
  );

  /**
   * MongoDB工具的处理器
   */
  server.setRequestHandler(CallToolRequestSchema, (request) =>
    useMemory
      ? handleCallToolRequestWithMemory({
          request,
          client,
          db,
          isReadOnlyMode,
          schedulerManager,
        })
      : handleCallToolRequest({
          request,
          client,
          db,
          isReadOnlyMode,
        })
  );

  // 如果启用Memory系统，添加Memory状态工具
  if (useMemory && schedulerManager) {
    // 将Memory状态工具注册到工具列表中
    // 这需要在schemas/tools.ts中添加相应的工具定义和处理函数
  }

  /**
   * 列出可用提示的处理器
   */
  server.setRequestHandler(ListPromptsRequestSchema, (request) =>
    handleListPromptsRequest({ request, client, db, isReadOnlyMode })
  );

  /**
   * 集合分析提示的处理器
   */
  server.setRequestHandler(GetPromptRequestSchema, (request) =>
    handleGetPromptRequest({ request, client, db, isReadOnlyMode })
  );

  /**
   * 列出模板的处理器
   */
  server.setRequestHandler(ListResourceTemplatesRequestSchema, (request) =>
    handleListResourceTemplatesRequest({ request, client, db, isReadOnlyMode })
  );

  /**
   * 完成请求的处理器
   */
  server.setRequestHandler(CompleteRequestSchema, (request) =>
    handleCompletionRequest({ request, client, db, isReadOnlyMode })
  );

  return server;
}
