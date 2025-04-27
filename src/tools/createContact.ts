import { ObjectId, Db } from "mongodb";
import { ContactsModel } from "../model/contacts.js";
import { Contact } from "../model/types.js";

/**
 * 联系人创建工具
 * 用于添加新联系人到系统
 */
export class CreateContactTool {
  private contactsModel: ContactsModel;

  constructor(db: Db) {
    this.contactsModel = new ContactsModel(db);
  }

  /**
   * 执行联系人创建
   * @param params 创建参数
   * @returns 创建结果
   */
  async execute(params: {
    name: string;
    phone?: string;
    email?: string;
    birthDate?: string;
    hukou?: string;
    school?: string;
    residence?: string;
    detailedResidence?: string;
    workAddress?: string;
    socialMedia?: string;
    avatar?: string;
    hobbies?: string;
    relationship?: string;
    tags?: string[];
    note?: string;
  }): Promise<{
    success: boolean;
    contact?: Contact;
    message?: string;
    error?: string;
  }> {
    try {
      const {
        name,
        phone,
        email,
        birthDate,
        hukou,
        school,
        residence,
        detailedResidence,
        workAddress,
        socialMedia,
        avatar,
        hobbies,
        relationship,
        tags = [],
        note,
      } = params;

      // 验证参数
      if (!name) {
        return {
          success: false,
          message: "必须提供联系人姓名",
        };
      }

      // 准备联系人数据
      const contactData: Partial<Contact> = {
        name,
        phone,
        email,
        hukou,
        school,
        residence,
        detailedResidence,
        workAddress,
        socialMedia,
        avatar,
        hobbies,
        relationship,
        tags,
      };

      // 处理出生日期
      if (birthDate) {
        contactData.birthDate = new Date(birthDate);
      }

      // 创建联系人
      const result = await this.createContact(contactData);

      if (!result.success) {
        return {
          success: false,
          error: result.error,
        };
      }

      // 如果提供了备注，添加联系人笔记
      if (note && result.contact) {
        await this.contactsModel.addContactNote(result.contact._id, note, [
          "creation",
        ]);

        // 重新查询联系人以获取更新的数据
        const updatedContact = await this.contactsModel.getContactById(
          result.contact._id
        );
        if (updatedContact) {
          result.contact = updatedContact;
        }
      }

      // 构建成功消息
      let successMessage = `成功创建联系人"${result.contact?.name}"`;

      if (relationship) {
        successMessage += `，关系: "${relationship}"`;
      }

      if (tags && tags.length > 0) {
        successMessage += `，标签: ${tags.join(", ")}`;
      }

      return {
        success: true,
        contact: result.contact,
        message: successMessage,
      };
    } catch (error) {
      console.error("创建联系人时出错:", error);
      return {
        success: false,
        message: `创建联系人时出错: ${error}`,
      };
    }
  }

  /**
   * 创建联系人
   * @param contactData 联系人数据
   * @returns 创建结果
   */
  private async createContact(contactData: Partial<Contact>): Promise<{
    success: boolean;
    contact?: Contact;
    error?: string;
  }> {
    try {
      // 添加通用字段
      const newContact: Partial<Contact> = {
        ...contactData,
        notes: [],
        syncedToNotion: false,
        modifiedSinceSync: true,
        lastSync: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // 插入联系人
      const result = await this.contactsModel["contactsCollection"].insertOne(
        newContact as any
      );

      if (!result.acknowledged) {
        return {
          success: false,
          error: "插入联系人失败",
        };
      }

      // 查询插入的联系人
      const contact = await this.contactsModel.getContactById(
        result.insertedId
      );

      return {
        success: true,
        contact: contact || undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: `创建联系人失败: ${error}`,
      };
    }
  }
}
