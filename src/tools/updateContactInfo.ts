import { ObjectId, Db } from "mongodb";
import { ContactsModel } from "../model/contacts.js";
import { Contact } from "../model/types.js";

/**
 * 联系人信息更新工具
 * 用于更新联系人的基本信息
 */
export class UpdateContactInfoTool {
  private contactsModel: ContactsModel;

  constructor(db: Db) {
    this.contactsModel = new ContactsModel(db);
  }

  /**
   * 执行联系人信息更新
   * @param params 更新参数
   * @returns 更新结果
   */
  async execute(params: {
    contactId?: string;
    contactName?: string;
    newName?: string;
    newPhone?: string;
    newEmail?: string;
    newBirthDate?: string;
    newHukou?: string;
    newSchool?: string;
    newResidence?: string;
    newDetailedResidence?: string;
    newWorkAddress?: string;
    newSocialMedia?: string;
    newAvatar?: string;
    newHobbies?: string;
    newRelationship?: string;
    newTags?: string[];
    note?: string;
  }): Promise<{
    success: boolean;
    contact?: Contact;
    message?: string;
    error?: string;
  }> {
    try {
      const {
        contactId,
        contactName,
        newName,
        newPhone,
        newEmail,
        newBirthDate,
        newHukou,
        newSchool,
        newResidence,
        newDetailedResidence,
        newWorkAddress,
        newSocialMedia,
        newAvatar,
        newHobbies,
        newRelationship,
        newTags,
        note,
      } = params;

      // 验证参数 - 需要提供联系人ID或名称
      if (!contactId && !contactName) {
        return {
          success: false,
          message: "必须提供联系人ID或名称",
        };
      }

      // 验证参数 - 需要提供至少一个要更新的字段
      if (
        !newName &&
        !newPhone &&
        !newEmail &&
        !newBirthDate &&
        !newHukou &&
        !newSchool &&
        !newResidence &&
        !newDetailedResidence &&
        !newWorkAddress &&
        !newSocialMedia &&
        !newAvatar &&
        !newHobbies &&
        !newRelationship &&
        !newTags
      ) {
        return {
          success: false,
          message: "必须提供至少一个要更新的字段",
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

      // 查询联系人当前信息
      const contact = await this.contactsModel.getContactById(
        new ObjectId(resolvedContactId!)
      );
      if (!contact) {
        return {
          success: false,
          message: `未找到ID为"${resolvedContactId}"的联系人`,
        };
      }

      // 构建更新对象
      const updateData: Partial<Contact> = {};

      if (newName) updateData.name = newName;
      if (newPhone) updateData.phone = newPhone;
      if (newEmail) updateData.email = newEmail;
      if (newBirthDate) updateData.birthDate = new Date(newBirthDate);
      if (newHukou) updateData.hukou = newHukou;
      if (newSchool) updateData.school = newSchool;
      if (newResidence) updateData.residence = newResidence;
      if (newDetailedResidence)
        updateData.detailedResidence = newDetailedResidence;
      if (newWorkAddress) updateData.workAddress = newWorkAddress;
      if (newSocialMedia) updateData.socialMedia = newSocialMedia;
      if (newAvatar) updateData.avatar = newAvatar;
      if (newHobbies) updateData.hobbies = newHobbies;
      if (newRelationship) updateData.relationship = newRelationship;
      if (newTags) updateData.tags = newTags;

      // 执行更新
      const result = await this.contactsModel.updateContact(
        resolvedContactId!,
        updateData
      );

      if (!result.success) {
        return {
          success: false,
          error: result.error,
        };
      }

      // 如果提供了备注，添加联系人笔记
      if (note && result.contact) {
        await this.contactsModel.addContactNote(result.contact._id, note, [
          "update_info",
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
      let successMessage = `成功更新联系人"${contact.name}"的信息`;
      const updatedFields = [];

      if (newName) updatedFields.push(`姓名: "${newName}"`);
      if (newPhone) updatedFields.push(`电话: "${newPhone}"`);
      if (newEmail) updatedFields.push(`邮箱: "${newEmail}"`);
      if (newBirthDate) updatedFields.push(`生日: "${newBirthDate}"`);
      if (newHukou) updatedFields.push(`户籍: "${newHukou}"`);
      if (newSchool) updatedFields.push(`学校: "${newSchool}"`);
      if (newRelationship) updatedFields.push(`关系: "${newRelationship}"`);

      if (updatedFields.length > 0) {
        successMessage += `，更新了: ${updatedFields.join(", ")}`;
      }

      return {
        success: true,
        contact: result.contact,
        message: successMessage,
      };
    } catch (error) {
      console.error("更新联系人信息时出错:", error);
      return {
        success: false,
        message: `更新联系人信息时出错: ${error}`,
      };
    }
  }
}
