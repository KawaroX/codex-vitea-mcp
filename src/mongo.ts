import { MongoClient, ReadPreference, type Db } from "mongodb";

/**
 * 初始化MongoDB连接
 * @param url MongoDB连接字符串
 * @param readOnly 是否以只读模式连接
 * @returns 包含client, db, 连接状态和只读模式的对象
 */
export async function connectToMongoDB(
  url: string,
  readOnly: boolean
): Promise<{
  client: MongoClient | null,
  db: Db | null,
  isConnected: boolean,
  isReadOnlyMode: boolean,
}> {
  try {
    const options = readOnly
      ? { readPreference: ReadPreference.SECONDARY }
      : {};

    const client = new MongoClient(url, options);
    await client.connect();
    const db = client.db();

    console.warn(`已连接到MongoDB数据库: ${db.databaseName}`);
    console.warn(`检测ViteaOS集合...`);

    // 验证ViteaOS所需的集合是否存在
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
      console.warn("系统将继续运行，但某些功能可能不可用");
    } else {
      console.warn("所有ViteaOS集合已验证");
    }

    return {
      client,
      db,
      isConnected: true,
      isReadOnlyMode: readOnly,
    };
  } catch (error) {
    console.error("连接到MongoDB失败:", error);
    return {
      client: null,
      db: null,
      isConnected: false,
      isReadOnlyMode: readOnly,
    };
  }
}
