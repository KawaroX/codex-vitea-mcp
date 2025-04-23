import type { ListResourceTemplatesRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Db, MongoClient } from "mongodb";

/**
 * 处理列出资源模板请求
 */
export async function handleListResourceTemplatesRequest({
  request,
  client,
  db,
  isReadOnlyMode,
}: {
  request: ListResourceTemplatesRequest;
  client: MongoClient;
  db: Db;
  isReadOnlyMode: boolean;
}) {
  return {
    resourceTemplates: [
      {
        name: "vitea_item_query",
        description: "物品查询模板",
        uriTemplate: "vitea://items/{itemName}",
        text: `要查询ViteaOS中的物品信息，可以使用以下格式：

1. 查询物品位置：
   使用find_item工具，提供物品名称或关键词。
   例如：find_item("眼药水")

2. 查询容器内物品：
   使用query_item工具，指定containerId和containerItems=true。
   例如：query_item(containerId="书包2的ID", containerItems=true)

3. 搜索物品：
   使用query_item工具，提供search参数。
   例如：query_item(search="书包")

可用的物品状态包括：在用、备用、损坏、丢失等。
物品可能位于特定位置，或者在某个容器内（如书包）。`,
      },
      {
        name: "vitea_location_query",
        description: "位置查询模板",
        uriTemplate: "vitea://locations/{locationName}",
        text: `要查询ViteaOS中的位置信息或估算出行时间，可以使用以下格式：

1. 查询位置详情：
   使用query_location工具，提供位置名称或ID。
   例如：query_location(search="宿舍")

2. 查询位置层次结构：
   使用query_location工具，提供hierarchyFor参数。
   例如：query_location(hierarchyFor="北航的ID")

3. 估算出行时间：
   使用estimate_time工具，提供起点和终点。
   例如：estimate_time(origin="宿舍", destination="主楼")

系统使用生物数据中的"走路速度"记录来计算时间估算。`,
      },
      {
        name: "vitea_contact_query",
        description: "联系人查询模板",
        uriTemplate: "vitea://contacts/{contactName}",
        text: `要查询ViteaOS中的联系人信息，可以使用以下格式：

1. 搜索联系人：
   使用query_contact工具，提供search参数。
   例如：query_contact(search="王")

2. 根据关系查询：
   使用query_contact工具，提供relationship参数。
   例如：query_contact(relationship="表姐")

3. 根据标签查询：
   使用query_contact工具，提供tag参数。
   例如：query_contact(tag="同学")

联系人数据包括姓名、电话、邮箱、学校、户籍地等信息，以及笔记记录。`,
      },
      {
        name: "vitea_task_query",
        description: "任务查询模板",
        uriTemplate: "vitea://tasks/{status}",
        text: `要查询ViteaOS中的任务信息，可以使用以下格式：

1. 获取待办任务：
   使用get_pending_tasks工具。
   例如：get_pending_tasks()

2. 查询逾期任务：
   使用query_task工具，设置overdue=true。
   例如：query_task(overdue=true)

3. 查询即将到期任务：
   使用query_task工具，设置upcoming=true和可选的days参数。
   例如：query_task(upcoming=true, days=3)

4. 根据类型查询：
   使用query_task工具，提供taskType参数。
   例如：query_task(taskType="法考")

任务状态包括：未开始、进行中、已完成、已取消等。`,
      },
      {
        name: "vitea_biodata_query",
        description: "生物数据查询模板",
        uriTemplate: "vitea://biodata/{measurementType}",
        text: `要查询ViteaOS中的生物数据信息，可以使用以下格式：

1. 获取最新测量值：
   使用get_latest_biodata工具，提供measurementType参数。
   例如：get_latest_biodata(measurementType="走路速度")

2. 查询测量历史：
   使用query_biodata工具，设置measurementType和history=true。
   例如：query_biodata(measurementType="体重", history=true)

3. 获取测量统计：
   使用query_biodata工具，使用query_biodata工具，设置measurementType和stats=true。
   例如：query_biodata(measurementType="体重", stats=true)

4. 查询所有测量类型：
   使用query_biodata工具，设置measurementTypes=true。
   例如：query_biodata(measurementTypes=true)

常见的测量类型包括：走路速度、体重、睡眠时长、从特定地点到另一地点用时等。`,
      },
    ],
  };
}
