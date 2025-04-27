import { ObjectId, Db } from "mongodb";
import { ContactsModel } from "../model/contacts.js";

/**
 * 联系人删除工具
 * 用于删除系统中的联系人
 */
export class DeleteContactTool {
  private contactsModel: ContactsModel;

  constructor(db: Db) {
    this.contactsModel = new ContactsModel(db);
  }

  /**
   * 执行联系人删除
   * @param params 删除参数
   * @returns 删除结果
   */
  async execute(params: { contactId?: string; contactName?: string }): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    try {
      const { contactId, contactName } = params;

      // 验证参数 - 需要提供联系人ID或名称
      if (!contactId && !contactName) {
        return {
          success: false,
          message: "必须提供联系人ID或名称",
        };
      }

      // 解析联系人ID
      let resolvedContactId = contactId;
      if (!resolvedContactId && contactName) {
        const contacts = await this.contactsModel.findContacts(contactName);
        if (contacts.length === 0) {
          return {
            success: false,
            message: `未找到名为"${contactName}"的联系人`,
          };
        }
        // 使用第一个匹配项
        resolvedContactId = contacts[0]._id.toString();
      }

      // 查询联系人详情，用于返回消息
      const contact = await this.contactsModel.getContactById(
        new ObjectId(resolvedContactId!)
      );
      if (!contact) {
        return {
          success: false,
          message: `未找到ID为"${resolvedContactId}"的联系人`,
        };
      }

      // 执行删除
      const result = await this.deleteContact(resolvedContactId!);

      if (!result.success) {
        return {
          success: false,
          error: result.error,
        };
      }

      // 构建成功消息
      const successMessage = `成功删除联系人"${contact.name}"`;

      return {
        success: true,
        message: successMessage,
      };
    } catch (error) {
      console.error("删除联系人时出错:", error);
      return {
        success: false,
        message: `删除联系人时出错: ${error}`,
      };
    }
  }

  /**
   * 删除联系人
   * @param contactId 联系人ID
   * @returns 删除结果
   */
  private async deleteContact(contactId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const id = new ObjectId(contactId);

      // 执行删除
      const result = await this.contactsModel["contactsCollection"].deleteOne({
        _id: id,
      });

      if (result.deletedCount === 0) {
        return {
          success: false,
          error: "删除联系人失败",
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `删除联系人失败: ${error}`,
      };
    }
  }
}
