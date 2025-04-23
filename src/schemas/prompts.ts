import type {
  GetPromptRequest,
  ListPromptsRequest,
} from "@modelcontextprotocol/sdk/types.js";
import type { Db, MongoClient } from "mongodb";
import { ItemsModel } from "../model/items.js";
import { LocationsModel } from "../model/locations.js";
import { ContactsModel } from "../model/contacts.js";
import { BioDataModel } from "../model/bioData.js";
import { TasksModel } from "../model/tasks.js";

/**
 * 处理列出提示请求
 */
export async function handleListPromptsRequest({
  request,
  client,
  db,
  isReadOnlyMode,
}: {
  request: ListPromptsRequest;
  client: MongoClient;
  db: Db;
  isReadOnlyMode: boolean;
}) {
  return {
    prompts: [
      {
        name: "analyze_vitea_item",
        description: "分析ViteaOS中的物品",
        arguments: [
          {
            name: "itemName",
            description: "物品名称或关键词",
            required: true,
          },
        ],
      },
      {
        name: "analyze_vitea_location",
        description: "分析ViteaOS中的位置",
        arguments: [
          {
            name: "locationName",
            description: "位置名称或关键词",
            required: true,
          },
        ],
      },
      {
        name: "analyze_travel_time",
        description: "分析两个位置之间的出行时间",
        arguments: [
          {
            name: "origin",
            description: "起点名称",
            required: true,
          },
          {
            name: "destination",
            description: "终点名称",
            required: true,
          },
        ],
      },
      {
        name: "analyze_vitea_contact",
        description: "分析ViteaOS中的联系人",
        arguments: [
          {
            name: "contactName",
            description: "联系人名称或关键词",
            required: true,
          },
        ],
      },
      {
        name: "analyze_vitea_biodata",
        description: "分析ViteaOS中的生物数据",
        arguments: [
          {
            name: "measurementType",
            description: "测量类型，如'走路速度'、'体重'等",
            required: true,
          },
        ],
      },
      {
        name: "analyze_vitea_tasks",
        description: "分析ViteaOS中的任务",
        arguments: [
          {
            name: "status",
            description: "任务状态，如'未开始'、'进行中'等",
            required: false,
          },
        ],
      },
    ],
  };
}

/**
 * 处理获取提示请求
 */
export async function handleGetPromptRequest({
  request,
  client,
  db,
  isReadOnlyMode,
}: {
  request: GetPromptRequest;
  client: MongoClient;
  db: Db;
  isReadOnlyMode: boolean;
}) {
  const { name, arguments: args = {} } = request.params;

  // 根据提示名称路由到相应处理器
  switch (name) {
    case "analyze_vitea_item":
      return await handleAnalyzeItemPrompt(db, args.itemName as string);
    case "analyze_vitea_location":
      return await handleAnalyzeLocationPrompt(db, args.locationName as string);
    case "analyze_travel_time":
      return await handleAnalyzeTravelTimePrompt(
        db,
        args.origin as string,
        args.destination as string
      );
    case "analyze_vitea_contact":
      return await handleAnalyzeContactPrompt(db, args.contactName as string);
    case "analyze_vitea_biodata":
      return await handleAnalyzeBioDataPrompt(
        db,
        args.measurementType as string
      );
    case "analyze_vitea_tasks":
      return await handleAnalyzeTasksPrompt(db, args.status as string);
    default:
      throw new Error("未知提示");
  }
}

/**
 * 处理分析物品提示
 */
async function handleAnalyzeItemPrompt(
  db: Db,
  itemName: string
): Promise<{
  messages: {
    role: string;
    content: {
      type: string;
      text: string;
    };
  }[];
}> {
  if (!itemName) {
    throw new Error("物品名称是必需的");
  }

  const itemsModel = new ItemsModel(db);
  const items = await itemsModel.findItems(itemName);

  if (items.length === 0) {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `我正在查找名为"${itemName}"的物品，但在ViteaOS系统中未找到匹配项。请帮我分析可能的原因，并建议如何解决这个问题。`,
          },
        },
      ],
    };
  }

  // 获取第一个匹配项的详细信息
  const itemInfo = await itemsModel.getItemLocation(items[0]._id);

  let promptText = `请分析以下ViteaOS物品的信息：

物品名称：${items[0].name}
`;

  if (items[0].category) {
    promptText += `类别：${items[0].category}\n`;
  }

  if (items[0].status) {
    promptText += `状态：${items[0].status}\n`;
  }

  if (itemInfo?.location) {
    promptText += `位置：${itemInfo.location.name}`;
    if (itemInfo.location.address) {
      promptText += ` (${itemInfo.location.address})`;
    }
    promptText += "\n";
  }

  if (itemInfo?.container) {
    promptText += `容器：${itemInfo.container.name}\n`;
  }

  if (items[0].notes && items[0].notes.length > 0) {
    promptText += `\n备注：\n`;
    items[0].notes.forEach((note, index) => {
      promptText += `${index + 1}. [${note.timestamp || "未知日期"}] ${
        note.content
      }\n`;
    });
  }

  promptText += `\n请基于上述信息分析这个物品的当前状态、位置和使用情况。如果有任何值得注意的地方，例如状态异常或位置不明确，请指出并提供建议。`;

  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: promptText,
        },
      },
    ],
  };
}

/**
 * 处理分析位置提示
 */
async function handleAnalyzeLocationPrompt(
  db: Db,
  locationName: string
): Promise<{
  messages: {
    role: string;
    content: {
      type: string;
      text: string;
    };
  }[];
}> {
  if (!locationName) {
    throw new Error("位置名称是必需的");
  }

  const locationsModel = new LocationsModel(db);
  const locations = await locationsModel.findLocations(locationName);

  if (locations.length === 0) {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `我正在查找名为"${locationName}"的位置，但在ViteaOS系统中未找到匹配项。请帮我分析可能的原因，并建议如何解决这个问题。`,
          },
        },
      ],
    };
  }

  // 获取第一个匹配项的层次结构
  const hierarchy = await locationsModel.getLocationHierarchy(locations[0]._id);

  let promptText = `请分析以下ViteaOS位置的信息：

位置名称：${locations[0].name}
`;

  if (locations[0].type) {
    promptText += `类型：${locations[0].type}\n`;
  }

  if (locations[0].address) {
    promptText += `地址：${locations[0].address}\n`;
  }

  if (locations[0].coordinates) {
    promptText += `坐标：${locations[0].coordinates.latitude}, ${locations[0].coordinates.longitude}\n`;
  }

  if (locations[0].openingHours) {
    promptText += `开放时间：${locations[0].openingHours}\n`;
  }

  promptText += `\n位置层次结构：\n`;

  if (hierarchy.parent) {
    promptText += `父位置：${hierarchy.parent.name}\n`;
  }

  if (hierarchy.children.length > 0) {
    promptText += `子位置：${hierarchy.children
      .map((c) => c.name)
      .join(", ")}\n`;
  }

  // 查询此位置包含的物品
  const itemsModel = new ItemsModel(db);
  const items = await db
    .collection("items")
    .find({ locationId: locations[0]._id })
    .toArray();

  if (items.length > 0) {
    promptText += `\n此位置包含的物品：\n`;
    items.slice(0, 10).forEach((item, index) => {
      promptText += `${index + 1}. ${item.name}`;
      if (item.status) {
        promptText += ` (${item.status})`;
      }
      promptText += "\n";
    });

    if (items.length > 10) {
      promptText += `... 以及${items.length - 10}个其他物品\n`;
    }
  }

  promptText += `\n请基于上述信息分析这个位置的特性、层次结构以及包含的物品。如果有任何值得注意的地方，请指出并提供建议。`;

  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: promptText,
        },
      },
    ],
  };
}

/**
 * 处理分析出行时间提示
 */
async function handleAnalyzeTravelTimePrompt(
  db: Db,
  origin: string,
  destination: string
): Promise<{
  messages: {
    role: string;
    content: {
      type: string;
      text: string;
    };
  }[];
}> {
  if (!origin || !destination) {
    throw new Error("起点和终点名称是必需的");
  }

  const locationsModel = new LocationsModel(db);
  const estimation = await locationsModel.estimateTravelTime(
    origin,
    destination
  );

  if (!estimation) {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `我正在尝试估算从"${origin}"到"${destination}"的出行时间，但ViteaOS系统无法提供准确估算。请帮我分析可能的原因，并建议如何解决这个问题。`,
          },
        },
      ],
    };
  }

  let promptText = `请分析以下ViteaOS出行时间估算：

起点：${estimation.origin.name}
终点：${estimation.destination.name}
预估时间：${estimation.estimatedTime} ${estimation.unit}
`;

  if (estimation.context) {
    promptText += `情境：${estimation.context}\n`;
  }

  if (estimation.baseSpeed && estimation.speedUnit) {
    promptText += `基础速度：${estimation.baseSpeed} ${estimation.speedUnit}\n`;
  }

  if (estimation.notes) {
    promptText += `备注：${estimation.notes}\n`;
  }

  // 查询与此路线相关的生物数据记录
  const bioDataModel = new BioDataModel(db);
  const records = await db
    .collection("bioData")
    .find({
      recordName: {
        $regex: new RegExp(
          `${estimation.origin.name}.*${estimation.destination.name}|${estimation.destination.name}.*${estimation.origin.name}`,
          "i"
        ),
      },
    })
    .toArray();

  if (records.length > 0) {
    promptText += `\n相关历史记录：\n`;
    records.forEach((record, index) => {
      const date = new Date(record.measuredAt);
      promptText += `${index + 1}. [${date.toLocaleDateString()}] ${
        record.recordName
      }: ${record.value} ${record.unit || ""}\n`;
      if (record.context) {
        promptText += `   情境: ${record.context}\n`;
      }
    });
  }

  promptText += `\n请基于上述信息分析这段路线的出行时间估算。考虑时间的合理性、影响因素（如路况、天气等），以及是否有任何可能影响出行时间的特殊情况。如有必要，请提供优化出行的建议。`;

  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: promptText,
        },
      },
    ],
  };
}

/**
 * 处理分析联系人提示
 */
async function handleAnalyzeContactPrompt(
  db: Db,
  contactName: string
): Promise<{
  messages: {
    role: string;
    content: {
      type: string;
      text: string;
    };
  }[];
}> {
  if (!contactName) {
    throw new Error("联系人名称是必需的");
  }

  const contactsModel = new ContactsModel(db);
  const contacts = await contactsModel.findContacts(contactName);

  if (contacts.length === 0) {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `我正在查找名为"${contactName}"的联系人，但在ViteaOS系统中未找到匹配项。请帮我分析可能的原因，并建议如何解决这个问题。`,
          },
        },
      ],
    };
  }

  // 获取第一个匹配项的详细信息
  const contact = contacts[0];
  const notes = await contactsModel.getContactNotes(contact._id);

  let promptText = `请分析以下ViteaOS联系人的信息：

联系人名称：${contact.name}
`;

  if (contact.phone) {
    promptText += `电话：${contact.phone}\n`;
  }

  if (contact.email) {
    promptText += `邮箱：${contact.email}\n`;
  }

  if (contact.hukou) {
    promptText += `户籍：${contact.hukou}\n`;
  }

  if (contact.school) {
    promptText += `学校：${contact.school}\n`;
  }

  if (contact.relationship) {
    promptText += `关系：${contact.relationship}\n`;
  }

  if (contact.tags && contact.tags.length > 0) {
    promptText += `标签：${contact.tags.join(", ")}\n`;
  }

  if (notes && notes.length > 0) {
    promptText += `\n笔记：\n`;
    notes.forEach((note, index) => {
      const date = new Date(note.createdAt);
      promptText += `${index + 1}. [${date.toLocaleDateString()}] ${
        note.content
      }`;
      if (note.tags && note.tags.length > 0) {
        promptText += ` (标签: ${note.tags.join(", ")})`;
      }
      promptText += "\n";
    });
  }

  promptText += `\n请基于上述信息分析这个联系人的基本情况、社交关系以及重要笔记。如果有任何值得注意的地方，请指出并提供建议。`;

  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: promptText,
        },
      },
    ],
  };
}

/**
 * 处理分析生物数据提示
 */
async function handleAnalyzeBioDataPrompt(
  db: Db,
  measurementType: string
): Promise<{
  messages: {
    role: string;
    content: {
      type: string;
      text: string;
    };
  }[];
}> {
  if (!measurementType) {
    throw new Error("测量类型是必需的");
  }

  const bioDataModel = new BioDataModel(db);
  const latest = await bioDataModel.getLatestMeasurement(measurementType);

  if (!latest) {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `我正在查找"${measurementType}"类型的生物数据，但在ViteaOS系统中未找到任何记录。请帮我分析可能的原因，并建议如何解决这个问题。`,
          },
        },
      ],
    };
  }

  // 获取历史记录和统计信息
  const history = await bioDataModel.getMeasurementHistory(measurementType, 10);
  const stats = await bioDataModel.getMeasurementStats(measurementType);

  let promptText = `请分析以下ViteaOS生物数据：

测量类型：${measurementType}
最新记录：${latest.value} ${latest.unit || ""}（${new Date(
    latest.measuredAt
  ).toLocaleDateString()}）
`;

  if (latest.context) {
    promptText += `情境：${latest.context}\n`;
  }

  if (stats) {
    promptText += `\n统计信息：\n`;
    promptText += `记录数量：${stats.count}\n`;
    promptText += `平均值：${stats.average} ${stats.unit || ""}\n`;
    promptText += `最小值：${stats.min} ${stats.unit || ""}\n`;
    promptText += `最大值：${stats.max} ${stats.unit || ""}\n`;
  }

  if (history && history.length > 1) {
    promptText += `\n历史记录（最近${history.length}条）：\n`;
    history.forEach((record, index) => {
      const date = new Date(record.measuredAt);
      promptText += `${index + 1}. [${date.toLocaleDateString()}] ${
        record.value
      } ${record.unit || ""}`;
      if (record.context) {
        promptText += ` (${record.context})`;
      }
      promptText += "\n";
    });
  }

  promptText += `\n请基于上述信息分析这类生物数据的趋势、波动和影响因素。如果有任何值得注意的异常或规律，请指出并提供建议。如果可能，也请分析这些数据对日常活动的影响。`;

  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: promptText,
        },
      },
    ],
  };
}

/**
 * 处理分析任务提示
 */
async function handleAnalyzeTasksPrompt(
  db: Db,
  status: string
): Promise<{
  messages: {
    role: string;
    content: {
      type: string;
      text: string;
    };
  }[];
}> {
  const tasksModel = new TasksModel(db);
  let tasks = [];

  if (status) {
    // 查询特定状态的任务
    tasks = await db.collection("tasks").find({ status }).toArray();
  } else {
    // 查询待办任务
    tasks = await tasksModel.getPendingTasks();
  }

  if (tasks.length === 0) {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: status
              ? `我正在查找状态为"${status}"的任务，但在ViteaOS系统中未找到匹配项。请帮我分析可能的原因，并建议如何解决这个问题。`
              : `我正在查找待办任务，但在ViteaOS系统中未找到任何待办任务。请帮我分析可能的原因，并提供任务管理的建议。`,
          },
        },
      ],
    };
  }

  // 获取任务统计信息
  const overdueTasks = tasks.filter((t) => t.isOverdue);
  const highPriorityTasks = tasks.filter((t) => t.priority === "高");
  const tasksByType: Record<string, number> = {};

  tasks.forEach((task) => {
    if (task.taskType) {
      tasksByType[task.taskType] = (tasksByType[task.taskType] || 0) + 1;
    }
  });

  let promptText = `请分析以下ViteaOS任务信息：

${status ? `状态为"${status}"的` : "待办"}任务总数：${tasks.length}
逾期任务数：${overdueTasks.length}
高优先级任务数：${highPriorityTasks.length}

任务类型分布：
`;

  Object.entries(tasksByType).forEach(([type, count]) => {
    promptText += `- ${type}: ${count}个任务\n`;
  });

  promptText += `\n任务列表（按截止日期和优先级排序）：\n`;

  tasks.slice(0, 10).forEach((task, index) => {
    promptText += `${index + 1}. ${task.name}`;

    if (task.priority) {
      promptText += ` [优先级: ${task.priority}]`;
    }

    if (task.dueDate) {
      const dueDate = new Date(task.dueDate);
      promptText += ` [截止: ${dueDate.toLocaleDateString()}]`;

      if (task.isOverdue) {
        promptText += " [已逾期]";
      }
    }

    if (task.taskType) {
      promptText += ` [类型: ${task.taskType}]`;
    }

    promptText += "\n";
  });

  if (tasks.length > 10) {
    promptText += `... 以及${tasks.length - 10}个其他任务\n`;
  }

  promptText += `\n请基于上述信息分析当前的任务情况、工作负荷和优先事项。重点关注任何逾期或高优先级任务，并提供任务管理和时间规划的建议。如果有任何任务类型特别集中，也请进行相应分析。`;

  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: promptText,
        },
      },
    ],
  };
}
