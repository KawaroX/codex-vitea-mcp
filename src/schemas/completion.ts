import type {
  CompleteRequest,
  CompleteResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { CollectionInfo, Db, MongoClient } from "mongodb";
import { ItemsModel } from "../model/items.js";
import { LocationsModel } from "../model/locations.js";
import { ContactsModel } from "../model/contacts.js";
import { BioDataModel } from "../model/bioData.js";
import { TasksModel } from "../model/tasks.js";

/**
 * 处理自动完成请求
 */
export async function handleCompletionRequest({
  request,
  client,
  db,
  isReadOnlyMode,
}: {
  request: CompleteRequest;
  client: MongoClient;
  db: Db;
  isReadOnlyMode: boolean;
}): Promise<CompleteResult> {
  const { ref, argument } = request.params;

  // 处理提示的自动完成
  if (ref.type === "ref/prompt") {
    return handlePromptCompletion(
      client,
      db,
      isReadOnlyMode,
      ref.name,
      argument
    );
  }

  // 处理资源的自动完成
  if (ref.type === "ref/resource") {
    return handleResourceCompletion(
      client,
      db,
      isReadOnlyMode,
      ref.uri,
      argument
    );
  }

  // 如果参考类型不受支持，则返回空响应
  return emptyCompletionResult();
}

/**
 * 处理提示的自动完成
 */
async function handlePromptCompletion(
  client: MongoClient,
  db: Db,
  isReadOnlyMode: boolean,
  promptName: string | undefined,
  argument: { name: string; value: string }
): Promise<CompleteResult> {
  if (!promptName) {
    return emptyCompletionResult();
  }

  // 根据提示名称和参数处理不同的自动完成场景
  switch (promptName) {
    case "analyze_vitea_item":
      if (argument.name === "itemName") {
        return completeItemNames(db, argument.value);
      }
      break;

    case "analyze_vitea_location":
      if (argument.name === "locationName") {
        return completeLocationNames(db, argument.value);
      }
      break;

    case "analyze_travel_time":
      if (argument.name === "origin" || argument.name === "destination") {
        return completeLocationNames(db, argument.value);
      }
      break;

    case "analyze_vitea_contact":
      if (argument.name === "contactName") {
        return completeContactNames(db, argument.value);
      }
      break;

    case "analyze_vitea_biodata":
      if (argument.name === "measurementType") {
        return completeMeasurementTypes(db, argument.value);
      }
      break;

    case "analyze_vitea_tasks":
      if (argument.name === "status") {
        return completeTaskStatuses(db, argument.value);
      }
      break;

    case "memory_status":
      if (argument.name === "detailed") {
        return {
          completion: {
            values: ["true", "false"],
            total: 2,
            hasMore: false
          }
        };
      }
      break;

    case "memory_maintenance":
      if (argument.name === "action") {
        return {
          completion: {
            values: ["cleanup_expired", "cleanup_old", "verify", "invalidate"],
            total: 4,
            hasMore: false
          }
        };
      }
      break;
  }

  return emptyCompletionResult();
}

/**
 * 处理资源的自动完成
 */
async function handleResourceCompletion(
  client: MongoClient,
  db: Db,
  isReadOnlyMode: boolean,
  uri: string | undefined,
  argument: { name: string; value: string }
): Promise<CompleteResult> {
  if (!uri) {
    return emptyCompletionResult();
  }

  // 解析URI
  try {
    const url = new URL(uri);

    // 处理ViteaOS特定资源
    if (url.protocol === "vitea:") {
      const path = url.pathname.replace(/^\//, "");
      const [resourceType, resourceId] = path.split("/");

      // 根据资源类型和参数处理不同的自动完成场景
      switch (resourceType) {
        case "items":
          if (argument.name === "itemName") {
            return completeItemNames(db, argument.value);
          }
          break;

        case "locations":
          if (argument.name === "locationName") {
            return completeLocationNames(db, argument.value);
          }
          break;

        case "contacts":
          if (argument.name === "contactName") {
            return completeContactNames(db, argument.value);
          }
          break;

        case "biodata":
          if (argument.name === "measurementType") {
            return completeMeasurementTypes(db, argument.value);
          }
          break;

        case "tasks":
          if (argument.name === "status") {
            return completeTaskStatuses(db, argument.value);
          }
          break;
      }
    }

    // 处理MongoDB集合
    if (argument.name === "collection") {
      return completeCollectionNames(argument.value, db);
    }
  } catch (error) {
    console.error("解析URI失败:", error);
  }

  return emptyCompletionResult();
}

/**
 * 自动完成物品名称
 */
async function completeItemNames(
  db: Db,
  partialValue: string
): Promise<CompleteResult> {
  try {
    const searchRegex = new RegExp(partialValue, "i");

    const items = await db
      .collection("items")
      .find({ name: searchRegex })
      .limit(100)
      .project({ name: 1 })
      .toArray();

    const itemNames = items.map((item) => item.name);

    return {
      completion: {
        values: itemNames,
        total: itemNames.length,
        hasMore: false,
      },
    };
  } catch (error) {
    console.error("自动完成物品名称失败:", error);
    return emptyCompletionResult();
  }
}

/**
 * 自动完成位置名称
 */
async function completeLocationNames(
  db: Db,
  partialValue: string
): Promise<CompleteResult> {
  try {
    const searchRegex = new RegExp(partialValue, "i");

    const locations = await db
      .collection("locations")
      .find({ name: searchRegex })
      .limit(100)
      .project({ name: 1 })
      .toArray();

    const locationNames = locations.map((location) => location.name);

    return {
      completion: {
        values: locationNames,
        total: locationNames.length,
        hasMore: false,
      },
    };
  } catch (error) {
    console.error("自动完成位置名称失败:", error);
    return emptyCompletionResult();
  }
}

/**
 * 自动完成联系人名称
 */
async function completeContactNames(
  db: Db,
  partialValue: string
): Promise<CompleteResult> {
  try {
    const searchRegex = new RegExp(partialValue, "i");

    const contacts = await db
      .collection("contacts")
      .find({ name: searchRegex })
      .limit(100)
      .project({ name: 1 })
      .toArray();

    const contactNames = contacts.map((contact) => contact.name);

    return {
      completion: {
        values: contactNames,
        total: contactNames.length,
        hasMore: false,
      },
    };
  } catch (error) {
    console.error("自动完成联系人名称失败:", error);
    return emptyCompletionResult();
  }
}

/**
 * 自动完成测量类型
 */
async function completeMeasurementTypes(
  db: Db,
  partialValue: string
): Promise<CompleteResult> {
  try {
    const bioDataModel = new BioDataModel(db);
    const allTypes = await bioDataModel.getAllMeasurementTypes();

    // 过滤匹配的类型
    const matchingTypes = allTypes.filter((type) =>
      type.toLowerCase().includes(partialValue.toLowerCase())
    );

    return {
      completion: {
        values: matchingTypes,
        total: matchingTypes.length,
        hasMore: false,
      },
    };
  } catch (error) {
    console.error("自动完成测量类型失败:", error);
    return emptyCompletionResult();
  }
}

/**
 * 自动完成任务状态
 */
async function completeTaskStatuses(
  db: Db,
  partialValue: string
): Promise<CompleteResult> {
  try {
    // 常见任务状态
    const statuses = ["未开始", "进行中", "已完成", "已取消", "待审核"];

    // 过滤匹配的状态
    const matchingStatuses = statuses.filter((status) =>
      status.toLowerCase().includes(partialValue.toLowerCase())
    );

    return {
      completion: {
        values: matchingStatuses,
        total: matchingStatuses.length,
        hasMore: false,
      },
    };
  } catch (error) {
    console.error("自动完成任务状态失败:", error);
    return emptyCompletionResult();
  }
}

/**
 * 自动完成集合名称
 */
async function completeCollectionNames(
  partialValue: string,
  db: Db
): Promise<CompleteResult> {
  try {
    // 获取集合列表
    const collections: (
      | CollectionInfo
      | Pick<CollectionInfo, "type" | "name">
    )[] = await db.listCollections().toArray();

    // 按部分值过滤集合（不区分大小写）
    const matchingCollections = collections
      .map((c) => c.name)
      .filter(
        (name) =>
          !name.startsWith("system.") &&
          name.toLowerCase().includes(partialValue.toLowerCase())
      )
      .sort();

    // 限制为100项
    const MAX_ITEMS = 100;
    const limitedResults = matchingCollections.slice(0, MAX_ITEMS);
    const hasMore = matchingCollections.length > MAX_ITEMS;

    return {
      completion: {
        values: limitedResults,
        total: matchingCollections.length,
        hasMore,
      },
    };
  } catch (error) {
    console.error("自动完成集合名称失败:", error);
    return emptyCompletionResult();
  }
}

/**
 * 创建空的自动完成结果
 */
function emptyCompletionResult(): CompleteResult {
  return {
    completion: {
      values: [],
      total: 0,
      hasMore: false,
    },
  };
}
