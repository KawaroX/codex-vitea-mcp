import type {
  ListResourcesRequest,
  ReadResourceRequest,
} from "@modelcontextprotocol/sdk/types.js";
import {
  ObjectId,
  type CollectionInfo,
  type Db,
  type IndexDescriptionInfo,
  type MongoClient,
} from "mongodb";
import { ItemsModel } from "../model/items.js";
import { LocationsModel } from "../model/locations.js";
import { ContactsModel } from "../model/contacts.js";
import { BioDataModel } from "../model/bioData.js";
import { TasksModel } from "../model/tasks.js";
import { Task } from "../model/types.js";

/**
 * 处理读取资源请求
 */
export async function handleReadResourceRequest({
  request,
  client,
  db,
  isReadOnlyMode,
}: {
  request: ReadResourceRequest;
  client: MongoClient;
  db: Db;
  isReadOnlyMode: boolean;
}) {
  const url = new URL(request.params.uri);
  const path = url.pathname.replace(/^\//, "");

  // CodexVitea特定资源处理
  if (url.protocol === "vitea:") {
    return await handleViteaResource(path, db);
  }

  // 标准MongoDB集合处理
  try {
    const collection = db.collection(path);
    const sample = await collection.findOne({});
    const indexes = await collection.indexes();

    const schema = sample
      ? {
          type: "collection",
          name: path,
          fields: Object.entries(sample).map(([key, value]) => ({
            name: key,
            type: typeof value,
          })),
          indexes: indexes.map((idx: IndexDescriptionInfo) => ({
            name: idx.name,
            keys: idx.key,
          })),
        }
      : {
          type: "collection",
          name: path,
          fields: [],
          indexes: [],
        };

    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: "application/json",
          text: JSON.stringify(schema, null, 2),
        },
      ],
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to read collection ${path}: ${error.message}`);
    }
    throw new Error(`Failed to read collection ${path}: Unknown error`);
  }
}

/**
 * 处理列出资源请求
 */
export async function handleListResourcesRequest({
  request,
  client,
  db,
  isReadOnlyMode,
}: {
  request: ListResourcesRequest;
  client: MongoClient;
  db: Db;
  isReadOnlyMode: boolean;
}) {
  try {
    const collections = await db.listCollections().toArray();

    // CodexVitea特定资源
    const viteaResources = [
      {
        uri: "vitea://items/all",
        mimeType: "application/json",
        name: "CodexVitea_物品",
        description: "所有物品信息和位置",
      },
      {
        uri: "vitea://locations/all",
        mimeType: "application/json",
        name: "CodexVitea_位置",
        description: "所有位置信息和层次结构",
      },
      {
        uri: "vitea://contacts/all",
        mimeType: "application/json",
        name: "Codex联系人",
        description: "所有联系人信息",
      },
      {
        uri: "vitea://biodata/all",
        mimeType: "application/json",
        name: "Codex生物数据",
        description: "所有生物数据测量记录",
      },
      {
        uri: "vitea://tasks/all",
        mimeType: "application/json",
        name: "CodexVitea_任务",
        description: "所有任务信息",
      },
    ];

    return {
      resources: viteaResources,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`列出集合失败: ${error.message}`);
    }
    throw new Error("列出集合失败: 未知错误");
  }
}

/**
 * 处理CodexVitea特定资源
 */
async function handleViteaResource(
  path: string,
  db: Db
): Promise<{
  contents: {
    uri: string;
    mimeType: string;
    text: string;
  }[];
}> {
  const [resourceType, resourceId] = path.split("/");

  try {
    let content: any = null;

    switch (resourceType) {
      case "items":
        content = await getItemsResource(db, resourceId);
        break;
      case "locations":
        content = await getLocationsResource(db, resourceId);
        break;
      case "contacts":
        content = await getContactsResource(db, resourceId);
        break;
      case "biodata":
        content = await getBioDataResource(db, resourceId);
        break;
      case "tasks":
        content = await getTasksResource(db, resourceId);
        break;
      default:
        throw new Error(`未知的CodexVitea资源类型: ${resourceType}`);
    }

    return {
      contents: [
        {
          uri: `vitea://${path}`,
          mimeType: "application/json",
          text: JSON.stringify(content, null, 2),
        },
      ],
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`读取CodexVitea资源失败: ${error.message}`);
    }
    throw new Error("读取CodexVitea资源失败: 未知错误");
  }
}

/**
 * 获取物品资源
 */
async function getItemsResource(db: Db, resourceId: string): Promise<any> {
  const itemsModel = new ItemsModel(db);

  if (resourceId === "all") {
    const items = await db.collection("items").find({}).limit(20).toArray();
    return {
      resourceType: "CodexVitea_物品",
      count: items.length,
      items,
      schema: {
        fields: [
          { name: "name", type: "string", description: "物品名称" },
          { name: "category", type: "string", description: "物品类别" },
          { name: "status", type: "string", description: "物品状态" },
          { name: "locationId", type: "ObjectId", description: "位置ID" },
          { name: "containerId", type: "ObjectId", description: "容器ID" },
          { name: "isContainer", type: "boolean", description: "是否为容器" },
          { name: "notes", type: "array", description: "备注" },
        ],
      },
    };
  } else {
    // 查询特定物品
    const item = await itemsModel.getItemById(
      new ObjectId(resourceId.toString())
    );

    if (!item) {
      throw new Error(`物品不存在: ${resourceId}`);
    }

    // 获取位置和容器信息
    const locationInfo = await itemsModel.getItemLocation(item._id);

    return {
      resourceType: "CodexVitea_物品",
      item,
      locationInfo,
    };
  }
}

/**
 * 获取位置资源
 */
async function getLocationsResource(db: Db, resourceId: string): Promise<any> {
  const locationsModel = new LocationsModel(db);

  if (resourceId === "all") {
    const locations = await db.collection("locations").find({}).toArray();
    return {
      resourceType: "CodexVitea位置",
      count: locations.length,
      locations,
      schema: {
        fields: [
          { name: "name", type: "string", description: "位置名称" },
          { name: "type", type: "string", description: "位置类型" },
          { name: "address", type: "string", description: "地址" },
          { name: "coordinates", type: "object", description: "坐标" },
          {
            name: "parentLocationId",
            type: "ObjectId",
            description: "父位置ID",
          },
          {
            name: "childLocations",
            type: "array",
            description: "子位置ID数组",
          },
        ],
      },
    };
  } else {
    // 查询特定位置
    const location = await locationsModel.getLocationById(
      new ObjectId(resourceId.toString())
    );

    if (!location) {
      throw new Error(`位置不存在: ${resourceId}`);
    }

    // 获取位置层次结构
    const hierarchy = await locationsModel.getLocationHierarchy(location._id);

    return {
      resourceType: "CodexVitea_位置",
      location,
      hierarchy,
    };
  }
}

/**
 * 获取联系人资源
 */
async function getContactsResource(db: Db, resourceId: string): Promise<any> {
  const contactsModel = new ContactsModel(db);

  if (resourceId === "all") {
    const contacts = await db.collection("contacts").find({}).toArray();
    return {
      resourceType: "CodexVitea_联系人",
      count: contacts.length,
      contacts,
      schema: {
        fields: [
          { name: "name", type: "string", description: "联系人名称" },
          { name: "phone", type: "string", description: "电话" },
          { name: "email", type: "string", description: "电子邮件" },
          { name: "hukou", type: "string", description: "户籍" },
          { name: "school", type: "string", description: "学校" },
          { name: "notes", type: "array", description: "笔记" },
        ],
      },
    };
  } else {
    // 查询特定联系人
    const contact = await contactsModel.getContactById(
      new ObjectId(resourceId.toString())
    );

    if (!contact) {
      throw new Error(`联系人不存在: ${resourceId}`);
    }

    // 获取联系人笔记
    const notes = await contactsModel.getContactNotes(contact._id);

    return {
      resourceType: "CodexVitea_联系人",
      contact,
      notes,
    };
  }
}

/**
 * 获取生物数据资源
 */
async function getBioDataResource(db: Db, resourceId: string): Promise<any> {
  const bioDataModel = new BioDataModel(db);

  if (resourceId === "all") {
    const types = await bioDataModel.getAllMeasurementTypes();

    // 获取每种类型的最新记录
    const latestRecords = [];
    for (const type of types) {
      const record = await bioDataModel.getLatestMeasurement(type);
      if (record) {
        latestRecords.push(record);
      }
    }

    return {
      resourceType: "CodexVitea_生物数据",
      measurementTypes: types,
      latestRecords,
      schema: {
        fields: [
          { name: "recordName", type: "string", description: "记录名称" },
          { name: "measurementType", type: "string", description: "测量类型" },
          { name: "value", type: "number", description: "测量值" },
          { name: "unit", type: "string", description: "单位" },
          { name: "measuredAt", type: "date", description: "测量时间" },
        ],
      },
    };
  } else if (resourceId.match(/^[\da-f]{24}$/i)) {
    // 查询特定记录（通过ID）
    const record = await bioDataModel.getRecordById(
      new ObjectId(resourceId.toString())
    );

    if (!record) {
      throw new Error(`生物数据记录不存在: ${resourceId}`);
    }

    return {
      resourceType: "CodexVitea_生物数据",
      record,
    };
  } else {
    // 查询特定类型的记录
    const records = await bioDataModel.getMeasurementHistory(resourceId);
    const stats = await bioDataModel.getMeasurementStats(resourceId);

    return {
      resourceType: "CodexVitea_生物数据",
      measurementType: resourceId,
      records,
      stats,
    };
  }
}

/**
 * 获取任务资源
 */
async function getTasksResource(db: Db, resourceId: string): Promise<any> {
  const tasksModel = new TasksModel(db);

  if (resourceId === "all") {
    const tasks = await db.collection("tasks").find({}).limit(20).toArray();
    return {
      resourceType: "CodexVitea_任务",
      count: tasks.length,
      tasks,
      schema: {
        fields: [
          { name: "name", type: "string", description: "任务名称" },
          { name: "status", type: "string", description: "状态" },
          { name: "dueDate", type: "date", description: "截止日期" },
          { name: "priority", type: "string", description: "优先级" },
          { name: "taskType", type: "string", description: "任务类型" },
          { name: "isOverdue", type: "boolean", description: "是否逾期" },
        ],
      },
    };
  } else if (resourceId.match(/^[\da-f]{24}$/i)) {
    // 查询特定任务（通过ID）
    const task = await tasksModel.getTaskById(
      new ObjectId(resourceId.toString())
    );

    if (!task) {
      throw new Error(`任务不存在: ${resourceId}`);
    }

    return {
      resourceType: "CodexVitea_任务",
      task,
    };
  } else if (["pending", "overdue", "upcoming"].includes(resourceId)) {
    // 查询特定状态的任务
    let tasks: Task[] = [];

    if (resourceId === "pending") {
      tasks = await tasksModel.getPendingTasks();
    } else if (resourceId === "overdue") {
      tasks = await tasksModel.getOverdueTasks();
    } else if (resourceId === "upcoming") {
      tasks = await tasksModel.getUpcomingTasks();
    }

    return {
      resourceType: "CodexVitea_任务",
      status: resourceId,
      count: tasks.length,
      tasks,
    };
  } else {
    // 查询特定类型的任务
    const tasks = await tasksModel.getTasksByType(resourceId);

    return {
      resourceType: "CodexVitea_任务",
      taskType: resourceId,
      count: tasks.length,
      tasks,
    };
  }
}

/**
 * 获取集合描述
 */
function getCollectionDescription(collectionName: string): string {
  const descriptions: Record<string, string> = {
    items: "物品数据集，存储物品名称、位置、状态等信息",
    locations: "位置数据集，存储地点名称、坐标、层次结构等信息",
    contacts: "联系人数据集，存储联系人信息、关系、笔记等",
    bioData: "生物数据集，存储各类生理指标、测量记录等",
    tasks: "任务数据集，存储待办事项、优先级、截止日期等",
  };

  return descriptions[collectionName] || `MongoDB集合: ${collectionName}`;
}
