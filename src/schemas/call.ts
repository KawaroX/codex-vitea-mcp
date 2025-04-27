import type { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Db, MongoClient } from "mongodb";

import { CreateItemTool } from "../tools/createItem.js";
import { UpdateItemInfoTool } from "../tools/updateItemInfo.js";
import { DeleteItemTool } from "../tools/deleteItem.js";
import { FindItemTool } from "../tools/findItem.js";
import { EstimateTimeTool } from "../tools/estimateTime.js";
import { TransferItemTool } from "../tools/transferItem.js";
import { UpdateTaskStatusTool } from "../tools/updateTaskStatus.js";
import { AddStructuredNoteTool } from "../tools/addStructuredNote.js";
import { SearchNotesTool } from "../tools/searchNotes.js";
import { CreateContactTool } from "../tools/createContact.js";
import { DeleteContactTool } from "../tools/deleteContact.js";
import { UpdateContactInfoTool } from "../tools/updateContactInfo.js";
import { CreateLocationTool } from "../tools/createLocation.js";
import { UpdateLocationInfoTool } from "../tools/updateLocationInfo.js";
import { DeleteLocationTool } from "../tools/deleteLocation.js";
import { CreateBioDataTool } from "../tools/createBioData.js";
import { DeleteBioDataTool } from "../tools/deleteBioData.js";
import { CreateTaskTool } from "../tools/createTask.js";
import { DeleteTaskTool } from "../tools/deleteTask.js";
import { UpdateTaskInfoTool } from "../tools/updateTaskInfo.js";

import { ItemsModel } from "../model/items.js";
import { LocationsModel } from "../model/locations.js";
import { ContactsModel } from "../model/contacts.js";
import { BioDataModel } from "../model/bioData.js";
import { TasksModel } from "../model/tasks.js";
import { ObjectId } from "mongodb";

// MongoDB 标准操作类型
type MongoOperation =
  // 物品操作
  | "create_item" // 创建物品
  | "delete_item" // 删除物品
  | "query_item" // 查询物品
  | "find_item" // 查找物品
  | "search_notes" // 搜索物品
  | "update_item" // 更新物品位置或状态
  | "update_item_info" // 更新物品基本信息
  | "transfer_item" // 转移物品
  // 位置操作
  | "estimate_time" // 估算出行时间
  | "create_location" // 创建位置
  | "update_location_info" // 更新位置信息
  | "delete_location" // 删除位置
  | "query_location" // 查询位置
  // 联系人操作
  | "create_contact" // 创建联系人
  | "delete_contact" // 删除联系人
  | "update_contact_info" // 更新联系人信息
  | "query_contact" // 查询联系人
  // 生物数据操作
  | "create_biodata" // 创建生物数据
  | "delete_biodata" // 删除生物数据
  | "query_biodata" // 查询生物数据
  | "get_latest_biodata" // 获取最新生物数据
  // 任务操作
  | "create_task" // 创建任务
  | "delete_task" // 删除任务
  | "update_task_info" // 更新任务信息
  | "query_task" // 查询任务
  | "get_pending_tasks" // 获取待办任务
  | "update_task_status" // 更新任务状态
  // 其他
  | "add_structured_note"; // 添加结构化笔记

// 不允许在只读模式下执行的操作
const WRITE_OPERATIONS = [
  "update_item",
  "update_item_info",
  "transfer_item",
  "create_contact",
  "delete_contact",
  "update_contact_info",
  "create_location",
  "update_location_info",
  "delete_location",
  "create_biodata",
  "delete_biodata",
  "create_task",
  "delete_task",
  "update_task_info",
];

// ObjectId 转换模式
type ObjectIdConversionMode = "auto" | "none" | "force";

/**
 * 处理调用工具请求
 */
export async function handleCallToolRequest({
  request,
  client,
  db,
  isReadOnlyMode,
}: {
  request: CallToolRequest;
  client: MongoClient;
  db: Db;
  isReadOnlyMode: boolean;
}) {
  const { name, arguments: args = {} } = request.params;
  const operation = name as MongoOperation;

  console.warn(`正在处理工具调用: ${operation}`);

  // 检查操作是否允许在只读模式下执行
  if (isReadOnlyMode && WRITE_OPERATIONS.includes(operation)) {
    throw new Error(`ReadonlyError: 操作 '${operation}' 在只读模式下不允许`);
  }

  // 根据操作名称路由到相应的处理器
  try {
    switch (operation) {
      case "create_item":
        return await handleCreateItem(db, args);
      case "delete_item":
        return await handleDeleteItem(db, args);
      case "find_item":
        return await handleFindItem(db, args);
      case "estimate_time":
        return await handleEstimateTime(db, args);
      case "update_item":
        return await handleUpdateItem(db, args);
      case "update_item_info":
        return await handleUpdateItemInfo(db, args);
      case "query_item":
        return await handleQueryItem(db, args);
      case "transfer_item":
        return await handleTransferItem(db, args);
      case "query_location":
        return await handleQueryLocation(db, args);
      case "create_contact":
        return await handleCreateContact(db, args);
      case "delete_contact":
        return await handleDeleteContact(db, args);
      case "update_contact_info":
        return await handleUpdateContactInfo(db, args);
      case "create_location":
        return await handleCreateLocation(db, args);
      case "update_location_info":
        return await handleUpdateLocationInfo(db, args);
      case "delete_location":
        return await handleDeleteLocation(db, args);
      case "create_biodata":
        return await handleCreateBioData(db, args);
      case "delete_biodata":
        return await handleDeleteBioData(db, args);
      case "create_task":
        return await handleCreateTask(db, args);
      case "delete_task":
        return await handleDeleteTask(db, args);
      case "update_task_info":
        return await handleUpdateTaskInfo(db, args);
      case "query_contact":
        return await handleQueryContact(db, args);
      case "query_biodata":
        return await handleQueryBioData(db, args);
      case "query_task":
        return await handleQueryTask(db, args);
      case "update_task_status":
        return await handleUpdateTaskStatus(db, args);
      case "get_latest_biodata":
        return await handleGetLatestBioData(db, args);
      case "get_pending_tasks":
        return await handleGetPendingTasks(db, args);
      case "add_structured_note":
        return await handleAddStructuredNote(db, args);
      case "search_notes":
        return await handleSearchNotes(db, args);
      default:
        throw new Error(`未知操作: ${operation}`);
    }
  } catch (error) {
    console.error(`处理工具调用 ${operation} 时出错:`, error);
    throw error;
  }
}

/**
 * 处理更新物品基本信息
 * @param db 数据库实例
 * @param args 参数
 * @returns 更新结果
 */
async function handleUpdateItemInfo(db: Db, args: Record<string, unknown>) {
  const updateItemInfoTool = new UpdateItemInfoTool(db);

  const itemId = args.itemId as string;
  const itemName = args.itemName as string;
  const newName = args.newName as string;
  const newCategory = args.newCategory as string;
  const newStatus = args.newStatus as string;
  const newQuantity = args.newQuantity as number;
  const note = args.note as string;

  if (!itemId && !itemName) {
    throw new Error("更新物品信息需要提供物品ID或名称");
  }

  if (!newName && !newCategory && !newStatus && newQuantity === undefined) {
    throw new Error("更新物品信息需要提供至少一个要更新的字段");
  }

  try {
    const result = await updateItemInfoTool.execute({
      itemId,
      itemName,
      newName,
      newCategory,
      newStatus,
      newQuantity,
      note,
    });

    if (!result.success) {
      return formatResponse({
        success: false,
        message: result.error || "更新物品信息失败",
        error: result.error,
      });
    }

    return formatResponse({
      success: true,
      message: result.message,
      item: result.item,
    });
  } catch (error) {
    return formatResponse({
      success: false,
      message: `更新物品信息失败: ${error}`,
      error: `${error}`,
    });
  }
}

/**
 * 处理创建物品
 * @param db 数据库实例
 * @param args 参数
 * @returns 创建结果
 */
async function handleCreateItem(db: Db, args: Record<string, unknown>) {
  const createItemTool = new CreateItemTool(db);

  // 验证参数
  if (!args.name) {
    throw new Error("创建物品需要提供名称");
  }

  // 解析参数
  const params = {
    name: args.name as string,
    category: args.category as string,
    status: args.status as string,
    quantity: args.quantity as number,
    isContainer: args.isContainer as boolean,
    locationId: args.locationId as string,
    locationName: args.locationName as string,
    containerId: args.containerId as string,
    containerName: args.containerName as string,
    note: args.note as string,
  };

  // 执行创建
  const result = await createItemTool.execute(params);

  // 格式化响应
  if (!result.success) {
    return formatResponse({
      success: false,
      message: result.message || result.error || "创建物品失败",
      error: result.error,
    });
  }

  return formatResponse({
    success: true,
    message: result.message,
    item: result.item,
  });
}

/**
 * 处理删除物品
 * @param db 数据库实例
 * @param args 参数
 * @returns 删除结果
 */
async function handleDeleteItem(db: Db, args: Record<string, unknown>) {
  const deleteItemTool = new DeleteItemTool(db);

  // 验证参数
  if (!args.itemId && !args.itemName) {
    throw new Error("删除物品需要提供物品ID或名称");
  }

  // 解析参数
  const params = {
    itemId: args.itemId as string,
    itemName: args.itemName as string,
    isSoftDelete: (args.isSoftDelete as boolean) ?? true,
  };

  // 执行删除
  const result = await deleteItemTool.execute(params);

  // 格式化响应
  if (!result.success) {
    return formatResponse({
      success: false,
      message: result.message || result.error || "删除物品失败",
      error: result.error,
    });
  }

  return formatResponse({
    success: true,
    message: result.message,
  });
}

/**
 * 处理更新物品
 * @param db 数据库实例
 * @param args 参数
 * @returns 更新结果
 */
async function handleUpdateItem(db: Db, args: Record<string, unknown>) {
  const itemsModel = new ItemsModel(db);

  const itemId = args.itemId as string;
  const locationId = args.locationId as string | null;
  const containerId = args.containerId as string | null;
  const note = args.note as string | null;

  if (!itemId) {
    throw new Error("更新物品需要提供物品ID");
  }

  try {
    const result = await itemsModel.updateItemLocation(
      itemId,
      locationId,
      containerId,
      note
    );

    if (!result.success) {
      return formatResponse({
        success: false,
        message: result.error || "更新物品失败",
        error: result.error,
      });
    }

    let message = `成功更新物品"${result.item?.name || itemId}"`;

    if (locationId || containerId) {
      message += "的位置";
    }

    return formatResponse({
      success: true,
      message,
      item: result.item,
    });
  } catch (error) {
    return formatResponse({
      success: false,
      message: `更新物品失败: ${error}`,
      error: `${error}`,
    });
  }
}

/**
 * 处理查询物品
 * @param db 数据库实例
 * @param args 参数
 * @returns 查询结果
 */
async function handleQueryItem(db: Db, args: Record<string, unknown>) {
  const itemsModel = new ItemsModel(db);

  // 处理不同的查询参数
  if (args.itemId) {
    // 根据ID查询
    const item = await itemsModel.getItemById(
      new ObjectId(args.itemId.toString())
    );
    return formatResponse({ item });
  }

  if (args.containerItems && args.containerId) {
    // 查询容器内的物品
    const items = await itemsModel.getItemsInContainer(
      args.containerId as string
    );
    return formatResponse({ items });
  }

  if (args.search) {
    // 搜索物品
    const items = await itemsModel.findItems(args.search as string);
    return formatResponse({ items });
  }

  throw new Error("查询物品需要提供有效的查询参数");
}

/**
 * 处理查找物品
 * @param db 数据库实例
 * @param args 参数
 * @returns 查找结果
 */
async function handleFindItem(db: Db, args: Record<string, unknown>) {
  const findItemTool = new FindItemTool(db);

  const itemName = args.itemName as string;
  const exactMatch = (args.exactMatch as boolean) || false;

  if (!itemName) {
    throw new Error("物品查找需要提供物品名称");
  }

  const result = await findItemTool.execute({
    itemName,
    exactMatch,
  });

  // 格式化响应
  const formattedResponse = findItemTool.formatResponse(result);

  return formatResponse({
    success: result.found,
    message: formattedResponse,
    items: result.items || [],
    rawResult: result,
  });
}

/**
 * 处理出行时间估算
 * @param db 数据库实例
 * @param args 参数
 * @returns 估算结果
 */
async function handleEstimateTime(db: Db, args: Record<string, unknown>) {
  const estimateTimeTool = new EstimateTimeTool(db);

  // 验证参数
  if (!args.origin || !args.destination) {
    throw new Error("时间估算需要提供起点和终点");
  }

  // 解析参数
  const params = {
    origin: args.origin as string,
    destination: args.destination as string,
    contactName: args.contactName as string,
    transportation: args.transportation as string || "walking", // 默认步行
  };

  // 验证交通方式
  const validTransportations = ["walking", "bicycling", "driving", "transit"];
  if (params.transportation && !validTransportations.includes(params.transportation)) {
    throw new Error(`无效的交通方式: ${params.transportation}, 可选: ${validTransportations.join(", ")}`);
  }

  try {
    const result = await estimateTimeTool.execute(params);

    if (!result.success) {
      return formatResponse({
        success: false,
        message: result.message || "时间估算失败",
      });
    }

    // 格式化响应
    const formattedResponse = estimateTimeTool.formatResponse(result);

    return formatResponse({
      success: true,
      message: formattedResponse,
      estimation: result.estimation,
      rawResult: result,
    });
  } catch (error) {
    return formatResponse({
      success: false,
      message: `估算时间时出错: ${error}`,
      error: `${error}`,
    });
  }
}

/**
 * 处理创建联系人
 * @param db 数据库实例
 * @param args 参数
 * @returns 创建结果
 */
async function handleCreateContact(db: Db, args: Record<string, unknown>) {
  const createContactTool = new CreateContactTool(db);

  // 验证基本参数
  if (!args.name) {
    throw new Error("创建联系人需要提供名称");
  }

  try {
    const result = await createContactTool.execute({
      name: args.name as string,
      phone: args.phone as string,
      email: args.email as string,
      birthDate: args.birthDate as string,
      hukou: args.hukou as string,
      school: args.school as string,
      residence: args.residence as string,
      detailedResidence: args.detailedResidence as string,
      workAddress: args.workAddress as string,
      socialMedia: args.socialMedia as string,
      avatar: args.avatar as string,
      hobbies: args.hobbies as string,
      relationship: args.relationship as string,
      tags: args.tags as string[],
      note: args.note as string,
    });

    if (!result.success) {
      return formatResponse({
        success: false,
        message: result.message || result.error || "创建联系人失败",
        error: result.error,
      });
    }

    return formatResponse({
      success: true,
      message: result.message,
      contact: result.contact,
    });
  } catch (error) {
    return formatResponse({
      success: false,
      message: `创建联系人失败: ${error}`,
      error: `${error}`,
    });
  }
}

/**
 * 处理删除联系人
 * @param db 数据库实例
 * @param args 参数
 * @returns 删除结果
 */
async function handleDeleteContact(db: Db, args: Record<string, unknown>) {
  const deleteContactTool = new DeleteContactTool(db);

  const contactId = args.contactId as string;
  const contactName = args.contactName as string;

  if (!contactId && !contactName) {
    throw new Error("删除联系人需要提供联系人ID或名称");
  }

  try {
    const result = await deleteContactTool.execute({
      contactId,
      contactName,
    });

    if (!result.success) {
      return formatResponse({
        success: false,
        message: result.message || result.error || "删除联系人失败",
        error: result.error,
      });
    }

    return formatResponse({
      success: true,
      message: result.message,
    });
  } catch (error) {
    return formatResponse({
      success: false,
      message: `删除联系人失败: ${error}`,
      error: `${error}`,
    });
  }
}

/**
 * 处理更新联系人信息
 * @param db 数据库实例
 * @param args 参数
 * @returns 更新结果
 */
async function handleUpdateContactInfo(db: Db, args: Record<string, unknown>) {
  const updateContactInfoTool = new UpdateContactInfoTool(db);

  // 基本参数验证
  if (!args.contactId && !args.contactName) {
    throw new Error("更新联系人信息需要提供联系人ID或名称");
  }

  try {
    const result = await updateContactInfoTool.execute({
      contactId: args.contactId as string,
      contactName: args.contactName as string,
      newName: args.newName as string,
      newPhone: args.newPhone as string,
      newEmail: args.newEmail as string,
      newBirthDate: args.newBirthDate as string,
      newHukou: args.newHukou as string,
      newSchool: args.newSchool as string,
      newResidence: args.newResidence as string,
      newDetailedResidence: args.newDetailedResidence as string,
      newWorkAddress: args.newWorkAddress as string,
      newSocialMedia: args.newSocialMedia as string,
      newAvatar: args.newAvatar as string,
      newHobbies: args.newHobbies as string,
      newRelationship: args.newRelationship as string,
      newTags: args.newTags as string[],
      note: args.note as string,
    });

    if (!result.success) {
      return formatResponse({
        success: false,
        message: result.message || result.error || "更新联系人信息失败",
        error: result.error,
      });
    }

    return formatResponse({
      success: true,
      message: result.message,
      contact: result.contact,
    });
  } catch (error) {
    return formatResponse({
      success: false,
      message: `更新联系人信息失败: ${error}`,
      error: `${error}`,
    });
  }
}

/**
 * 处理创建位置
 * @param db 数据库实例
 * @param args 参数
 * @returns 创建结果
 */
async function handleCreateLocation(db: Db, args: Record<string, unknown>) {
  const createLocationTool = new CreateLocationTool(db);

  // 验证基本参数
  if (!args.name) {
    throw new Error("创建位置需要提供名称");
  }

  try {
    const coordinates = args.coordinates as
      | { latitude: number; longitude: number }
      | undefined;

    const result = await createLocationTool.execute({
      name: args.name as string,
      type: args.type as string,
      address: args.address as string,
      openingHours: args.openingHours as string,
      phone: args.phone as string,
      parentLocationId: args.parentLocationId as string,
      parentLocationName: args.parentLocationName as string,
      coordinates,
      notes: args.notes as string,
    });

    if (!result.success) {
      return formatResponse({
        success: false,
        message: result.message || result.error || "创建位置失败",
        error: result.error,
      });
    }

    return formatResponse({
      success: true,
      message: result.message,
      location: result.location,
    });
  } catch (error) {
    return formatResponse({
      success: false,
      message: `创建位置失败: ${error}`,
      error: `${error}`,
    });
  }
}

/**
 * 处理更新位置信息
 * @param db 数据库实例
 * @param args 参数
 * @returns 更新结果
 */
async function handleUpdateLocationInfo(db: Db, args: Record<string, unknown>) {
  const updateLocationInfoTool = new UpdateLocationInfoTool(db);

  // 基本参数验证
  if (!args.locationId && !args.locationName) {
    throw new Error("更新位置信息需要提供位置ID或名称");
  }

  try {
    const newCoordinates = args.newCoordinates as
      | { latitude: number; longitude: number }
      | undefined;

    const result = await updateLocationInfoTool.execute({
      locationId: args.locationId as string,
      locationName: args.locationName as string,
      newName: args.newName as string,
      newType: args.newType as string,
      newAddress: args.newAddress as string,
      newOpeningHours: args.newOpeningHours as string,
      newPhone: args.newPhone as string,
      newParentLocationId: args.newParentLocationId as string,
      newParentLocationName: args.newParentLocationName as string,
      newCoordinates,
      newNotes: args.newNotes as string,
    });

    if (!result.success) {
      return formatResponse({
        success: false,
        message: result.message || result.error || "更新位置信息失败",
        error: result.error,
      });
    }

    return formatResponse({
      success: true,
      message: result.message,
      location: result.location,
    });
  } catch (error) {
    return formatResponse({
      success: false,
      message: `更新位置信息失败: ${error}`,
      error: `${error}`,
    });
  }
}

/**
 * 处理删除位置
 * @param db 数据库实例
 * @param args 参数
 * @returns 删除结果
 */
async function handleDeleteLocation(db: Db, args: Record<string, unknown>) {
  const deleteLocationTool = new DeleteLocationTool(db);

  // 基本参数验证
  if (!args.locationId && !args.locationName) {
    throw new Error("删除位置需要提供位置ID或名称");
  }

  try {
    const result = await deleteLocationTool.execute({
      locationId: args.locationId as string,
      locationName: args.locationName as string,
      force: args.force as boolean,
    });

    if (!result.success) {
      return formatResponse({
        success: false,
        message: result.message || result.error || "删除位置失败",
        error: result.error,
      });
    }

    return formatResponse({
      success: true,
      message: result.message,
    });
  } catch (error) {
    return formatResponse({
      success: false,
      message: `删除位置失败: ${error}`,
      error: `${error}`,
    });
  }
}

/**
 * 处理创建生物数据
 * @param db 数据库实例
 * @param args 参数
 * @returns 创建结果
 */
async function handleCreateBioData(db: Db, args: Record<string, unknown>) {
  const createBioDataTool = new CreateBioDataTool(db);

  // 验证基本参数
  if (!args.measurementType) {
    throw new Error("创建生物数据需要提供测量类型");
  }

  if (args.value === undefined || args.value === null) {
    throw new Error("创建生物数据需要提供测量值");
  }

  try {
    const result = await createBioDataTool.execute({
      measurementType: args.measurementType as string,
      value: args.value as number,
      unit: args.unit as string,
      recordName: args.recordName as string,
      context: args.context as string,
      notes: args.notes as string,
      measuredAt: args.measuredAt as string,
    });

    if (!result.success) {
      return formatResponse({
        success: false,
        message: result.message || result.error || "创建生物数据失败",
        error: result.error,
      });
    }

    return formatResponse({
      success: true,
      message: result.message,
      record: result.record,
    });
  } catch (error) {
    return formatResponse({
      success: false,
      message: `创建生物数据失败: ${error}`,
      error: `${error}`,
    });
  }
}

/**
 * 处理删除生物数据
 * @param db 数据库实例
 * @param args 参数
 * @returns 删除结果
 */
async function handleDeleteBioData(db: Db, args: Record<string, unknown>) {
  const deleteBioDataTool = new DeleteBioDataTool(db);

  // 基本参数验证
  if (!args.recordId && !(args.measurementType && args.recordName)) {
    throw new Error("删除生物数据需要提供记录ID或(测量类型+记录名称)");
  }

  try {
    const result = await deleteBioDataTool.execute({
      recordId: args.recordId as string,
      measurementType: args.measurementType as string,
      recordName: args.recordName as string,
    });

    if (!result.success) {
      return formatResponse({
        success: false,
        message: result.message || result.error || "删除生物数据失败",
        error: result.error,
      });
    }

    return formatResponse({
      success: true,
      message: result.message,
    });
  } catch (error) {
    return formatResponse({
      success: false,
      message: `删除生物数据失败: ${error}`,
      error: `${error}`,
    });
  }
}

/**
 * 处理创建任务
 * @param db 数据库实例
 * @param args 参数
 * @returns 创建结果
 */
async function handleCreateTask(db: Db, args: Record<string, unknown>) {
  const createTaskTool = new CreateTaskTool(db);

  // 验证基本参数
  if (!args.name) {
    throw new Error("创建任务需要提供名称");
  }

  try {
    const result = await createTaskTool.execute({
      name: args.name as string,
      status: args.status as string,
      dueDate: args.dueDate as string,
      priority: args.priority as string,
      taskType: args.taskType as string,
      description: args.description as string,
      workloadLevel: args.workloadLevel as string,
      assignee: args.assignee as string,
      tags: args.tags as string[],
      note: args.note as string,
    });

    if (!result.success) {
      return formatResponse({
        success: false,
        message: result.message || result.error || "创建任务失败",
        error: result.error,
      });
    }

    return formatResponse({
      success: true,
      message: result.message,
      task: result.task,
    });
  } catch (error) {
    return formatResponse({
      success: false,
      message: `创建任务失败: ${error}`,
      error: `${error}`,
    });
  }
}

/**
 * 处理删除任务
 * @param db 数据库实例
 * @param args 参数
 * @returns 删除结果
 */
async function handleDeleteTask(db: Db, args: Record<string, unknown>) {
  const deleteTaskTool = new DeleteTaskTool(db);

  // 基本参数验证
  if (!args.taskId && !args.taskName) {
    throw new Error("删除任务需要提供任务ID或名称");
  }

  try {
    const result = await deleteTaskTool.execute({
      taskId: args.taskId as string,
      taskName: args.taskName as string,
    });

    if (!result.success) {
      return formatResponse({
        success: false,
        message: result.message || result.error || "删除任务失败",
        error: result.error,
      });
    }

    return formatResponse({
      success: true,
      message: result.message,
    });
  } catch (error) {
    return formatResponse({
      success: false,
      message: `删除任务失败: ${error}`,
      error: `${error}`,
    });
  }
}

/**
 * 处理更新任务信息
 * @param db 数据库实例
 * @param args 参数
 * @returns 更新结果
 */
async function handleUpdateTaskInfo(db: Db, args: Record<string, unknown>) {
  const updateTaskInfoTool = new UpdateTaskInfoTool(db);

  // 基本参数验证
  if (!args.taskId && !args.taskName) {
    throw new Error("更新任务信息需要提供任务ID或名称");
  }

  try {
    const result = await updateTaskInfoTool.execute({
      taskId: args.taskId as string,
      taskName: args.taskName as string,
      newName: args.newName as string,
      newDueDate: args.newDueDate as string,
      newPriority: args.newPriority as string,
      newTaskType: args.newTaskType as string,
      newDescription: args.newDescription as string,
      newWorkloadLevel: args.newWorkloadLevel as string,
      newAssignee: args.newAssignee as string,
      newTags: args.newTags as string[],
      note: args.note as string,
    });

    if (!result.success) {
      return formatResponse({
        success: false,
        message: result.message || result.error || "更新任务信息失败",
        error: result.error,
      });
    }

    return formatResponse({
      success: true,
      message: result.message,
      task: result.task,
    });
  } catch (error) {
    return formatResponse({
      success: false,
      message: `更新任务信息失败: ${error}`,
      error: `${error}`,
    });
  }
}

/**
 * 处理查询位置
 * @param db 数据库实例
 * @param args 参数
 * @returns 查询结果
 */
async function handleQueryLocation(db: Db, args: Record<string, unknown>) {
  const locationsModel = new LocationsModel(db);

  // 处理不同的查询参数
  if (args.locationId) {
    // 根据ID查询
    const location = await locationsModel.getLocationById(
      new ObjectId(args.locationId.toString())
    );
    return formatResponse({ location });
  }

  if (args.hierarchyFor) {
    // 查询位置层次结构
    const hierarchy = await locationsModel.getLocationHierarchy(
      args.hierarchyFor as string
    );
    return formatResponse({ hierarchy });
  }

  if (args.childrenOf) {
    // 查询子位置
    const children = await locationsModel.getChildLocations(
      args.childrenOf as string
    );
    return formatResponse({ children });
  }

  if (args.search) {
    // 搜索位置
    const locations = await locationsModel.findLocations(args.search as string);
    return formatResponse({ locations });
  }

  throw new Error("查询位置需要提供有效的查询参数");
}

/**
 * 处理查询联系人
 * @param db 数据库实例
 * @param args 参数
 * @returns 查询结果
 */
async function handleQueryContact(db: Db, args: Record<string, unknown>) {
  const contactsModel = new ContactsModel(db);

  // 处理不同的查询参数
  if (args.contactId) {
    // 根据ID查询
    const contact = await contactsModel.getContactById(
      new ObjectId(args.contactId.toString())
    );
    return formatResponse({ contact });
  }

  if (args.relationship) {
    // 根据关系查询
    const contacts = await contactsModel.getContactsByRelationship(
      args.relationship as string
    );
    return formatResponse({ contacts });
  }

  if (args.tag) {
    // 根据标签查询
    const contacts = await contactsModel.getContactsByTag(args.tag as string);
    return formatResponse({ contacts });
  }

  if (args.school) {
    // 根据学校查询
    const contacts = await contactsModel.getContactsBySchool(
      args.school as string
    );
    return formatResponse({ contacts });
  }

  if (args.hukou) {
    // 根据户籍查询
    const contacts = await contactsModel.getContactsByHukou(
      args.hukou as string
    );
    return formatResponse({ contacts });
  }

  if (args.search) {
    // 搜索联系人
    const contacts = await contactsModel.findContacts(args.search as string);
    return formatResponse({ contacts });
  }

  throw new Error("查询联系人需要提供有效的查询参数");
}

/**
 * 处理查询生物数据
 * @param db 数据库实例
 * @param args 参数
 * @returns 查询结果
 */
async function handleQueryBioData(db: Db, args: Record<string, unknown>) {
  const bioDataModel = new BioDataModel(db);

  // 处理不同的查询参数
  if (args.recordId) {
    // 根据ID查询
    const record = await bioDataModel.getRecordById(
      new ObjectId(args.recordId.toString())
    );
    return formatResponse({ record });
  }

  if (args.measurementType && args.stats) {
    // 获取统计信息
    const stats = await bioDataModel.getMeasurementStats(
      args.measurementType as string
    );
    return formatResponse({ stats });
  }

  if (args.measurementType && args.history) {
    // 获取历史记录
    const limit = (args.limit as number) || 10;
    const history = await bioDataModel.getMeasurementHistory(
      args.measurementType as string,
      limit
    );
    return formatResponse({ history });
  }

  if (args.measurementTypes) {
    // 获取所有测量类型
    const types = await bioDataModel.getAllMeasurementTypes();
    return formatResponse({ types });
  }

  if (args.search) {
    // 搜索记录
    const records = await bioDataModel.searchRecords(args.search as string);
    return formatResponse({ records });
  }

  throw new Error("查询生物数据需要提供有效的查询参数");
}

/**
 * 处理查询任务
 * @param db 数据库实例
 * @param args 参数
 * @returns 查询结果
 */
async function handleQueryTask(db: Db, args: Record<string, unknown>) {
  const tasksModel = new TasksModel(db);

  // 处理不同的查询参数
  if (args.taskId) {
    // 根据ID查询
    const task = await tasksModel.getTaskById(
      new ObjectId(args.taskId.toString())
    );
    return formatResponse({ task });
  }

  if (args.tag) {
    // 根据标签查询
    const tasks = await tasksModel.getTasksByTag(args.tag as string);
    return formatResponse({ tasks });
  }

  if (args.taskType) {
    // 根据任务类型查询
    const tasks = await tasksModel.getTasksByType(args.taskType as string);
    return formatResponse({ tasks });
  }

  if (args.upcoming) {
    // 获取即将到期的任务
    const days = typeof args.days === "number" ? args.days : 7;
    const tasks = await tasksModel.getUpcomingTasks(days);
    return formatResponse({ tasks });
  }

  if (args.overdue) {
    // 获取逾期任务
    const tasks = await tasksModel.getOverdueTasks();
    return formatResponse({ tasks });
  }

  if (args.allTasks) {
    // 获取所有任务
    const query = (args.query as any) || {};
    const limit = (args.limit as number) || 20;
    const tasks = await tasksModel.getAllTasks(query, limit);
    return formatResponse({ tasks });
  }

  throw new Error("查询任务需要提供有效的查询参数");
}

/**
 * 处理更新任务状态
 * @param db 数据库实例
 * @param args 参数
 * @returns 更新结果
 */
async function handleUpdateTaskStatus(db: Db, args: Record<string, unknown>) {
  const updateTaskStatusTool = new UpdateTaskStatusTool(db);

  // 验证参数
  if (!args.taskId && !args.taskName) {
    throw new Error("更新任务状态需要提供任务ID或名称");
  }

  if (!args.newStatus) {
    throw new Error("更新任务状态需要提供新状态");
  }

  // 解析参数
  const params = {
    taskId: args.taskId as string,
    taskName: args.taskName as string,
    newStatus: args.newStatus as string,
    comment: args.comment as string,
  };

  // 执行状态更新
  const result = await updateTaskStatusTool.execute(params);

  // 格式化响应
  if (!result.success) {
    return formatResponse({
      success: false,
      message: result.message || result.error || "更新任务状态失败",
      error: result.error,
    });
  }

  return formatResponse({
    success: true,
    message: result.message,
    task: result.task,
  });
}

/**
 * 处理获取最新生物数据
 * @param db 数据库实例
 * @param args 参数
 * @returns 查询结果
 */
async function handleGetLatestBioData(db: Db, args: Record<string, unknown>) {
  const bioDataModel = new BioDataModel(db);

  const measurementType = args.measurementType as string;

  if (!measurementType) {
    throw new Error("获取最新生物数据需要提供测量类型");
  }

  const record = await bioDataModel.getLatestMeasurement(measurementType);

  if (!record) {
    return formatResponse({
      success: false,
      message: `未找到"${measurementType}"类型的测量记录`,
    });
  }

  let message = `${record.measurementType}: ${record.value}`;

  if (record.unit) {
    message += ` ${record.unit}`;
  }

  if (record.measuredAt) {
    const date = new Date(record.measuredAt);
    message += ` (测量于 ${date.toLocaleDateString()})`;
  }

  return formatResponse({
    success: true,
    message,
    record,
  });
}

/**
 * 处理获取待办任务
 * @param db 数据库实例
 * @param args 参数
 * @returns 查询结果
 */
async function handleGetPendingTasks(db: Db, args: Record<string, unknown>) {
  const tasksModel = new TasksModel(db);

  const limit = (args.limit as number) || 10;
  const tasks = await tasksModel.getPendingTasks(limit);

  if (tasks.length === 0) {
    return formatResponse({
      success: true,
      message: "当前没有待办任务",
      tasks: [],
    });
  }

  // 构建简洁的任务列表
  let message = `共有 ${tasks.length} 个待办任务:\n`;

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    message += `${i + 1}. ${task.name}`;

    if (task.priority) {
      message += ` [优先级: ${task.priority}]`;
    }

    if (task.dueDate) {
      const dueDate = new Date(task.dueDate);
      const now = new Date();

      if (dueDate < now) {
        message += " [已逾期]";
      } else {
        // 计算剩余天数
        const daysRemaining = Math.ceil(
          (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysRemaining <= 1) {
          message += " [今天到期]";
        } else if (daysRemaining <= 3) {
          message += " [即将到期]";
        }
      }
    }

    message += "\n";
  }

  return formatResponse({
    success: true,
    message: message.trim(),
    tasks,
  });
}

/**
 * 格式化响应为标准格式
 * @param data 响应数据
 * @returns 格式化后的响应
 */
function formatResponse(data: any): {
  content: [{ type: string; text: string }];
} {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          data,
          (key, value) => {
            // 处理ObjectId转换为字符串
            if (value instanceof ObjectId) {
              return value.toString();
            }
            return value;
          },
          2
        ),
      },
    ],
  };
}

/**
 * 处理物品转移
 * @param db 数据库实例
 * @param args 参数
 * @returns 转移结果
 */
async function handleTransferItem(db: Db, args: Record<string, unknown>) {
  const transferItemTool = new TransferItemTool(db);

  // 验证参数
  if (!args.itemId && !args.itemName) {
    throw new Error("物品转移需要提供物品ID或名称");
  }

  if (
    !args.targetLocationId &&
    !args.targetLocationName &&
    !args.targetContainerId &&
    !args.targetContainerName
  ) {
    throw new Error("物品转移需要提供目标位置或容器");
  }

  // 解析参数
  const params = {
    itemId: args.itemId as string,
    itemName: args.itemName as string,
    targetLocationId: args.targetLocationId as string,
    targetLocationName: args.targetLocationName as string,
    targetContainerId: args.targetContainerId as string,
    targetContainerName: args.targetContainerName as string,
    note: args.note as string,
    removeFromCurrentContainer:
      (args.removeFromCurrentContainer as boolean) ?? true,
  };

  // 执行转移
  const result = await transferItemTool.execute(params);

  // 格式化响应
  if (!result.success) {
    return formatResponse({
      success: false,
      message: result.message || result.error || "物品转移失败",
      error: result.error,
    });
  }

  return formatResponse({
    success: true,
    message: result.message,
    item: result.item,
  });
}

/**
 * 处理添加结构化笔记
 * @param db 数据库实例
 * @param args 参数
 * @returns 添加结果
 */
async function handleAddStructuredNote(db: Db, args: Record<string, unknown>) {
  const addStructuredNoteTool = new AddStructuredNoteTool(db);

  // 验证参数
  if (!args.entityType) {
    throw new Error("添加笔记需要提供实体类型");
  }

  if (!args.content) {
    throw new Error("添加笔记需要提供内容");
  }

  if (!args.entityId && !args.entityName) {
    throw new Error("添加笔记需要提供实体ID或名称");
  }

  // 解析参数
  const params = {
    entityType: args.entityType as string,
    entityId: args.entityId as string,
    entityName: args.entityName as string,
    content: args.content as string,
    tags: (args.tags as string[]) || [],
    relatedEntities:
      (args.relatedEntities as Array<{
        type: string;
        id?: string;
        name?: string;
      }>) || [],
  };

  // 执行添加笔记
  const result = await addStructuredNoteTool.execute(params);

  // 格式化响应
  if (!result.success) {
    return formatResponse({
      success: false,
      message: result.message || result.error || "添加笔记失败",
      error: result.error,
    });
  }

  return formatResponse({
    success: true,
    message: result.message,
    note: result.note,
  });
}

/**
 * 处理搜索笔记
 * @param db 数据库实例
 * @param args 参数
 * @returns 搜索结果
 */
async function handleSearchNotes(db: Db, args: Record<string, unknown>) {
  const searchNotesTool = new SearchNotesTool(db);

  // 验证参数
  if (!args.tag && !args.entityType) {
    throw new Error("搜索笔记需要提供标签或实体类型");
  }

  if (args.entityType && !args.entityId && !args.entityName) {
    throw new Error("搜索实体笔记需要提供实体ID或名称");
  }

  // 解析参数
  const params = {
    tag: args.tag as string,
    entityType: args.entityType as string,
    entityId: args.entityId as string,
    entityName: args.entityName as string,
    limit: (args.limit as number) || 20,
  };

  // 执行搜索
  const result = await searchNotesTool.execute(params);

  // 格式化响应
  if (!result.success) {
    return formatResponse({
      success: false,
      message: result.message || result.error || "搜索笔记失败",
      error: result.error,
    });
  }

  return formatResponse({
    success: true,
    message: result.message,
    results: result.results,
  });
}
