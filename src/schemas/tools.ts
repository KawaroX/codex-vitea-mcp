import type { ListToolsRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Db, MongoClient } from "mongodb";

/**
 * 处理列出工具请求
 */
export async function handleListToolsRequest({
  request,
  client,
  db,
  isReadOnlyMode,
}: {
  request: ListToolsRequest;
  client: MongoClient;
  db: Db;
  isReadOnlyMode: boolean;
}) {
  // 定义ViteaOS特有工具
  const viteaTools = [
    {
      name: "find_item",
      description: "查找物品位置和状态",
      inputSchema: {
        type: "object",
        properties: {
          itemName: {
            type: "string",
            description: "要查找的物品名称或关键词",
          },
          exactMatch: {
            type: "boolean",
            description: "是否精确匹配名称（默认为false，进行模糊匹配）",
            default: false,
          },
        },
        required: ["itemName"],
      },
    },
    {
      name: "estimate_time",
      description: "估算从一个地点到另一个地点的出行时间",
      inputSchema: {
        type: "object",
        properties: {
          origin: {
            type: "string",
            description: "出发地名称或ID",
          },
          destination: {
            type: "string",
            description: "目的地名称或ID",
          },
        },
        required: ["origin", "destination"],
      },
    },
    {
      name: "query_item",
      description: "查询物品信息",
      inputSchema: {
        type: "object",
        properties: {
          itemId: {
            type: "string",
            description: "物品ID",
          },
          search: {
            type: "string",
            description: "搜索关键词",
          },
          containerId: {
            type: "string",
            description: "容器ID，用于查询容器内物品",
          },
          containerItems: {
            type: "boolean",
            description: "是否查询容器内物品，需要与containerId一起使用",
            default: false,
          },
        },
        oneOf: [
          { required: ["itemId"] },
          { required: ["search"] },
          { required: ["containerId", "containerItems"] },
        ],
      },
    },
    {
      name: "query_location",
      description: "查询位置信息",
      inputSchema: {
        type: "object",
        properties: {
          locationId: {
            type: "string",
            description: "位置ID",
          },
          search: {
            type: "string",
            description: "搜索关键词",
          },
          hierarchyFor: {
            type: "string",
            description: "查询位置层次结构的位置ID",
          },
          childrenOf: {
            type: "string",
            description: "父位置ID，用于查询子位置",
          },
        },
        oneOf: [
          { required: ["locationId"] },
          { required: ["search"] },
          { required: ["hierarchyFor"] },
          { required: ["childrenOf"] },
        ],
      },
    },
    {
      name: "query_contact",
      description: "查询联系人信息",
      inputSchema: {
        type: "object",
        properties: {
          contactId: {
            type: "string",
            description: "联系人ID",
          },
          search: {
            type: "string",
            description: "搜索关键词",
          },
          relationship: {
            type: "string",
            description: "关系类型",
          },
          tag: {
            type: "string",
            description: "联系人标签",
          },
          school: {
            type: "string",
            description: "学校或单位",
          },
          hukou: {
            type: "string",
            description: "户籍地",
          },
        },
        oneOf: [
          { required: ["contactId"] },
          { required: ["search"] },
          { required: ["relationship"] },
          { required: ["tag"] },
          { required: ["school"] },
          { required: ["hukou"] },
        ],
      },
    },
    {
      name: "query_biodata",
      description: "查询生物数据",
      inputSchema: {
        type: "object",
        properties: {
          recordId: {
            type: "string",
            description: "记录ID",
          },
          measurementType: {
            type: "string",
            description: "测量类型，如'走路速度'、'体重'等",
          },
          history: {
            type: "boolean",
            description: "是否查询历史记录，需要与measurementType一起使用",
            default: false,
          },
          stats: {
            type: "boolean",
            description: "是否查询统计信息，需要与measurementType一起使用",
            default: false,
          },
          limit: {
            type: "integer",
            description: "限制返回记录数量",
            default: 10,
          },
          measurementTypes: {
            type: "boolean",
            description: "是否查询所有测量类型",
            default: false,
          },
          search: {
            type: "string",
            description: "搜索关键词",
          },
        },
        oneOf: [
          { required: ["recordId"] },
          { required: ["measurementType", "history"] },
          { required: ["measurementType", "stats"] },
          { required: ["measurementTypes"] },
          { required: ["search"] },
        ],
      },
    },
    {
      name: "query_task",
      description: "查询任务信息",
      inputSchema: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "任务ID",
          },
          tag: {
            type: "string",
            description: "任务标签",
          },
          taskType: {
            type: "string",
            description: "任务类型",
          },
          upcoming: {
            type: "boolean",
            description: "是否查询即将到期的任务",
            default: false,
          },
          days: {
            type: "integer",
            description: "天数阈值，用于即将到期任务查询",
            default: 7,
          },
          overdue: {
            type: "boolean",
            description: "是否查询逾期任务",
            default: false,
          },
          allTasks: {
            type: "boolean",
            description: "是否查询所有任务",
            default: false,
          },
          query: {
            type: "object",
            description: "自定义查询条件",
          },
          limit: {
            type: "integer",
            description: "限制返回任务数量",
            default: 20,
          },
        },
        oneOf: [
          { required: ["taskId"] },
          { required: ["tag"] },
          { required: ["taskType"] },
          { required: ["upcoming"] },
          { required: ["overdue"] },
          { required: ["allTasks"] },
        ],
      },
    },
  ];

  // 非只读模式添加更新工具
  if (!isReadOnlyMode) {
    viteaTools.push({
      name: "update_item",
      description: "更新物品位置或状态",
      inputSchema: {
        type: "object",
        properties: {
          itemId: {
            type: "string",
            description: "物品ID",
          },
          search: {
            type: "string",
            description: "搜索关键词",
          },
          containerId: {
            type: "string",
            description: "容器ID，用于查询容器内物品",
          },
          containerItems: {
            type: "boolean",
            description: "是否查询容器内物品，需要与containerId一起使用",
            default: false,
          },
        },
        oneOf: [
          { required: ["itemId"] },
          { required: ["search"] },
          { required: ["containerId", "containerItems"] },
        ],
      },
    });
  }

  // 添加便捷工具
  viteaTools.push(
    {
      name: "get_latest_biodata",
      description: "获取最新的生物数据测量值",
      inputSchema: {
        type: "object",
        properties: {
          measurementType: {
            type: "string",
            description: "测量类型，如'走路速度'、'体重'等",
          },
          recordId: {
            type: "string",
            description: "记录ID",
          },
          history: {
            type: "boolean",
            description: "是否查询历史记录，需要与measurementType一起使用",
            default: false,
          },
          stats: {
            type: "boolean",
            description: "是否查询统计信息，需要与measurementType一起使用",
            default: false,
          },
          limit: {
            type: "integer",
            description: "限制返回记录数量",
            default: 1,
          },
          measurementTypes: {
            type: "boolean",
            description: "是否查询所有测量类型",
            default: false,
          },
          search: {
            type: "string",
            description: "搜索关键词",
          },
        },
        oneOf: [
          { required: ["recordId"] },
          { required: ["measurementType", "history"] },
          { required: ["measurementType", "stats"] },
          { required: ["measurementTypes"] },
          { required: ["search"] },
        ],
      },
    },
    {
      name: "get_pending_tasks",
      description: "获取待办任务列表",
      inputSchema: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "特定任务ID",
          },
          tag: {
            type: "string",
            description: "任务标签筛选",
          },
          taskType: {
            type: "string",
            description: "任务类型筛选",
          },
          upcoming: {
            type: "boolean",
            description: "是否只查询即将到期任务",
            default: false,
          },
          days: {
            type: "integer",
            description: "即将到期的天数阈值",
            default: 7,
          },
          overdue: {
            type: "boolean",
            description: "是否只查询逾期任务",
            default: false,
          },
          allTasks: {
            type: "boolean",
            description: "是否查询所有任务",
            default: false,
          },
          query: {
            type: "object",
            description: "自定义查询条件",
          },
          limit: {
            type: "integer",
            description: "限制返回任务数量",
            default: 10,
          },
        },
        oneOf: [
          { required: ["taskId"] },
          { required: ["tag"] },
          { required: ["taskType"] },
          { required: ["upcoming"] },
          { required: ["overdue"] },
          { required: ["allTasks"] },
        ],
      },
    }
  );

  return {
    tools: viteaTools,
  };
}
