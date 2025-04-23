import { type Collection, ObjectId, type Db } from "mongodb";
import { Contact, ensureObjectId } from "./types.js";

/**
 * 联系人数据操作类
 */
export class ContactsModel {
  private contactsCollection: Collection<Contact>;
  private db: Db;

  constructor(db: Db) {
    this.db = db;
    this.contactsCollection = db.collection<Contact>("contacts");
  }

  /**
   * 根据关键词查找联系人
   * @param searchTerm 搜索关键词
   * @returns 匹配的联系人列表
   */
  async findContacts(searchTerm: string): Promise<Contact[]> {
    const searchRegex = new RegExp(searchTerm, "i");

    const contacts = await this.contactsCollection
      .find({
        $or: [
          { name: searchRegex },
          { phone: searchRegex },
          { email: searchRegex },
          { school: searchRegex },
          { hukou: searchRegex },
          { relationship: searchRegex },
        ],
      })
      .limit(10)
      .toArray();

    return contacts;
  }

  /**
   * 根据ID查询单个联系人
   * @param contactId 联系人ID
   * @returns 联系人对象
   */
  async getContactById(contactId: ObjectId): Promise<Contact | null> {
    const id = ensureObjectId(contactId);
    return await this.contactsCollection.findOne({ _id: id });
  }

  /**
   * 根据关系类型查找联系人
   * @param relationship 关系类型
   * @returns 匹配的联系人列表
   */
  async getContactsByRelationship(relationship: string): Promise<Contact[]> {
    return await this.contactsCollection
      .find({ relationship: new RegExp(relationship, "i") })
      .toArray();
  }

  /**
   * 根据标签查找联系人
   * @param tag 标签
   * @returns 匹配的联系人列表
   */
  async getContactsByTag(tag: string): Promise<Contact[]> {
    return await this.contactsCollection.find({ tags: tag }).toArray();
  }

  /**
   * 查找同一学校/机构的联系人
   * @param school 学校/机构名称
   * @returns 匹配的联系人列表
   */
  async getContactsBySchool(school: string): Promise<Contact[]> {
    return await this.contactsCollection
      .find({ school: new RegExp(school, "i") })
      .toArray();
  }

  /**
   * 查找同一户籍地的联系人
   * @param hukou 户籍地
   * @returns 匹配的联系人列表
   */
  async getContactsByHukou(hukou: string): Promise<Contact[]> {
    return await this.contactsCollection
      .find({ hukou: new RegExp(hukou, "i") })
      .toArray();
  }

  /**
   * 获取联系人笔记
   * @param contactId 联系人ID
   * @param tag 可选的笔记标签筛选
   * @returns 笔记列表
   */
  async getContactNotes(
    contactId: string | ObjectId,
    tag?: string
  ): Promise<Array<{ content: string; createdAt: Date; tags?: string[] }>> {
    const id = ensureObjectId(contactId);
    const contact = await this.contactsCollection.findOne({ _id: id });

    if (!contact || !contact.notes || !Array.isArray(contact.notes)) {
      return [];
    }

    // 如果指定了标签，进行筛选
    if (tag) {
      return contact.notes.filter(
        (note) =>
          note.tags &&
          note.tags.some((t) => t.toLowerCase() === tag.toLowerCase())
      );
    }

    return contact.notes;
  }

  /**
   * 添加联系人笔记
   * @param contactId 联系人ID
   * @param content 笔记内容
   * @param tags 可选的标签数组
   * @returns 操作结果
   */
  async addContactNote(
    contactId: string | ObjectId,
    content: string,
    tags: string[] = []
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const id = ensureObjectId(contactId);

      const note = {
        content,
        createdAt: new Date(),
        tags,
      };

      const result = await this.contactsCollection.updateOne(
        { _id: id },
        {
          $push: { notes: note },
          $set: {
            updatedAt: new Date(),
            modifiedSinceSync: true,
          },
        }
      );

      if (result.matchedCount === 0) {
        return { success: false, error: "未找到联系人" };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `添加联系人笔记失败: ${error}`,
      };
    }
  }

  /**
   * 获取联系人的所有标签
   * @param contactId 联系人ID
   * @returns 标签列表
   */
  async getContactTags(contactId: string | ObjectId): Promise<string[]> {
    const id = ensureObjectId(contactId);
    const contact = await this.contactsCollection.findOne(
      { _id: id },
      { projection: { tags: 1 } }
    );

    if (!contact || !contact.tags) {
      return [];
    }

    return contact.tags;
  }

  /**
   * 获取系统中所有的联系人标签
   * @returns 标签列表
   */
  async getAllContactTags(): Promise<string[]> {
    const result = await this.contactsCollection
      .aggregate([
        { $unwind: "$tags" },
        { $group: { _id: "$tags" } },
        { $project: { _id: 0, tag: "$_id" } },
      ])
      .toArray();

    return result.map((item) => item.tag);
  }

  /**
   * 更新联系人信息
   * @param contactId 联系人ID
   * @param updateData 要更新的字段
   * @returns 更新结果
   */
  async updateContact(
    contactId: string | ObjectId,
    updateData: Partial<Contact>
  ): Promise<{ success: boolean; contact?: Contact; error?: string }> {
    try {
      const id = ensureObjectId(contactId);

      // 删除不应该直接更新的字段
      const { _id, createdAt, notes, ...safeUpdateData } = updateData as any;

      // 添加更新时间和同步标记
      const dataToUpdate = {
        ...safeUpdateData,
        updatedAt: new Date(),
        modifiedSinceSync: true,
      };

      const result = await this.contactsCollection.updateOne(
        { _id: id },
        { $set: dataToUpdate }
      );

      if (result.matchedCount === 0) {
        return { success: false, error: "未找到联系人" };
      }

      // 查询更新后的联系人
      const updatedContact = await this.getContactById(
        new ObjectId(id.toString())
      );

      return {
        success: true,
        contact: updatedContact || undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: `更新联系人失败: ${error}`,
      };
    }
  }
}
