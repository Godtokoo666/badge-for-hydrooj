import {
    _, Context, db, Handler, NotFoundError,ObjectId , param, PermissionError, PRIV, Types
} from 'hydrooj';

import { deleteUserCache } from 'hydrooj/src/model/user';

const collbd = db.collection('badge');
const collubd = db.collection('userBadge');
const collusr = db.collection('user');

interface UserBadge {
    _id: ObjectId;
    owner: number;
    badgeId: number;
    getAt: Date;
}

interface Badge {
    _id: number;
    short: string;
    title: string;
    backgroundColor: string;
    fontColor: string;
    content: string;
    users: [number];
    createdAt: Date;
}

declare module 'hydrooj' {
    interface Model {
        userBadge: typeof UserBadgeModel;
        badge: typeof BadgeModel;
    }
    interface Collections {
        userBadge: UserBadge;
        badge: Badge;
    }
}

const UserBadgeModel = { userBadgeAdd, userBadgeGetMuilt, userBadgeDel, userBadgeSel };
const BadgeModel = { BadgeGetMuilt, BadgeAdd, BadgeGet, BadgeEdit, BadgeDel };
global.Hydro.model.userBadge = UserBadgeModel;
global.Hydro.model.badge = BadgeModel;

async function setUserBadge(userId:number, badgeId: number, badge: String): Promise<number> {
    const result = (await collusr.findOneAndUpdate({_id: userId}, { $set: { badgeId: badgeId, badge: badge } }));
    if (result) {
        await deleteUserCache(result);
    }
    return result._id;
}

async function resetBadge(badgeId: number, badge: String): Promise<number> {
    const result = (await collusr.updateMany({badgeId: badgeId}, { $set: { badge: badge } })).modifiedCount;
    if (result) {
        await deleteUserCache(true);
    }
    return result;
}

async function unsetUserBadge(userId: number): Promise<number> {
    const result = (await collusr.findOneAndUpdate({_id: userId}, { $unset: { badgeId: '',badge:'' } }));
    if (result) {
        await deleteUserCache(result);
    }
    return result._id;
}

async function unsetBadge(badgeId: number): Promise<number> {
    const result =(await collusr.updateMany({badgeId: badgeId}, { $unset: { badgeId: '',badge:'' } })).modifiedCount;
    if (result) {
        await deleteUserCache(true);
    }
    return result;
}

async function userBadgeAdd(userId: number, badgeId: number): Promise<string> {
    const result = await collubd.insertOne({
        owner: userId,
        badgeId: badgeId,
        getAt: new Date()
    })
    return result.insertedId;
}

async function userBadgeGetMuilt(userId: number): Promise<UserBadge[]> {
    return await collubd.find({ owner: userId}).sort({ badgeId: 1 });
}


async function userBadgeDel(userId: number, badgeId: number): Promise<number> {
    if ((await collusr.findOne({_id: userId})).badgeId === badgeId) {
        await unsetUserBadge(userId);
    }
    return (await collubd.deleteOne({owner: userId, badgeId: badgeId})).deletedCount;
}

async function userBadgeSel(userId: number, badgeId: number): Promise<number> {
    const userBadgeId = await collubd.findOne({owner: userId, badgeId: badgeId});
    if(userBadgeId) {
        const badge: Badge = await collbd.findOne({_id: badgeId});
        const badgeid: number = badge._id;
        const payload: string = badge._id+'#'+badge.short+badge.backgroundColor+badge.fontColor+'#'+badge.title;
        return await setUserBadge(userId, badgeid, payload);
    } else {
        return 0;
    }
}

async function BadgeGetMuilt(): Promise<Badge[]> {
    return await collbd.find({});
}

async function BadgeAdd(short: string, title: string, backgroundColor: string, fontColor: string,content: string, users: [number],badgeId?: number,): Promise<number> {
    if (typeof badgeId !== 'number') {
        const [badge] = await collbd.find({}).sort({ _id: -1 }).limit(1).toArray();
        badgeId = Math.max((badge?._id || 0 ) + 1, 1);
    };
    const result = await collbd.insertOne({
        _id: badgeId,
        short: short,
        title: title,
        backgroundColor: backgroundColor,
        fontColor: fontColor,
        content: content,
        users: users,
        createAt: new Date()
    });
    if (users) {
        for (const userId of users) {
            await UserBadgeModel.userBadgeAdd(userId, badgeId);
        }
    }
    return result.insertedId;
}

async function BadgeGet(badgeId: number): Promise<Badge> {
    return await collbd.findOne({_id: badgeId});
}

async function BadgeEdit(badgeId: number, short: string, title: string, backgroundColor: string, fontColor: string, content: string, users: [number], users_old: [number]): Promise<number> {
    const result = await collbd.updateOne({_id: badgeId}, {
        $set: {
            short: short,
            title: title,
            backgroundColor: backgroundColor,
            fontColor: fontColor,
            content: content,
            users: users
        }
    });
    if (users_old) {
        for (const userId of users_old) {
            if (!users||!users.includes(userId))
                await UserBadgeModel.userBadgeDel(userId, badgeId);
        }
    }
    if(users) {
        for (const userId of users) {
            if (!users_old||!users_old.includes(userId))
                await UserBadgeModel.userBadgeAdd(userId, badgeId);
        }
    }
    const badge: string = badgeId+'#'+short+backgroundColor+fontColor+'#'+title;
    await resetBadge(badgeId, badge);
    return result.modifiedCount;    
}

async function BadgeDel(badgeId: number): Promise<number> {
    const result = await collbd.deleteOne({_id: badgeId});
    await collubd.deleteMany({badgeId: badgeId});
    await unsetBadge(badgeId);
    return result.deletedCount;
}

class UserBadgeManageHandler extends Handler {
    @param('page', Types.PositiveInt, true)
    async get(domainId:string, page = 1, userId = this.user._id) {
        const[ddocs, dpcount] = await this.ctx.db.paginate(
            await UserBadgeModel.userBadgeGetMuilt(userId),
            page,
            10
        );
        this.response.template = 'user_badge_manage.html';
        for (const ddoc of ddocs) {
            ddoc.badge = await BadgeModel.BadgeGet(ddoc.badgeId);
        }
        const current_badge = (await collusr.findOne({_id: userId})).badge;
        this.response.body = {
            ddocs: ddocs,
            dpcount: dpcount,
            page: page,
            current_badge: current_badge,
        }
    }

    @param('badgeId', Types.PositiveInt, true)
    async postEnable(domainId:string, badgeId: number) {
        await userBadgeSel(this.user._id, badgeId);
        this.response.redirect=this.url('user_badge_manage');
    }

    async postReset(domainId:string) {
        await unsetUserBadge(this.user._id);
        this.response.redirect=this.url('user_badge_manage');
    }
}

class BadgeManageHandler extends Handler {
    @param('page', Types.PositiveInt, true)
    async get(domainId:string, page = 1) {
        const[ddocs, dpcount] = await this.ctx.db.paginate(
            await BadgeModel.BadgeGetMuilt(),
            page,
            10
        );
        this.response.template = 'badge_manage.html';
        this.response.body = {
            ddocs: ddocs,
            dpcount: dpcount,
            page: page
        }
    }
}

class BadgeAddHandler extends Handler {
    async get(domainId:string) {
        this.response.template = 'badge_add.html';
    }

    @param('short', Types.String)
    @param('title', Types.String)
    @param('backgroundColor', Types.String)
    @param('fontColor', Types.String)
    @param('content', Types.Content)
    @param('users', Types.NumericArray, true)
    async postAdd(domainId: string, short: string, title: string, backgroundColor: string, fontColor: string, content: string, users: [number]) {
        const badgeId = await BadgeAdd(short, title, backgroundColor, fontColor, content, users);
        this.response.redirect=this.url('badge_detail', {id:badgeId});
    }
}

class BadgeEditHandler extends Handler {
    @param('id', Types.PositiveInt, true)
    async get(domainId:string, id: number) {
        const badge = await BadgeModel.BadgeGet(id);
        if (!badge) throw new NotFoundError(`Badge ${id} is not exist!`);
        this.users_old = badge.users;
        this.response.template = 'badge_edit.html';
        this.response.body = {
            badge: badge
        }
    }

    @param('id', Types.PositiveInt, true)
    @param('short', Types.String)
    @param('title', Types.String)
    @param('backgroundColor', Types.String)
    @param('fontColor', Types.String)
    @param('content', Types.Content)
    @param('users', Types.NumericArray, true)
    async postUpdate(domainId:string, id: number, short: string, title: string, backgroundColor: string, fontColor: string, content: string, users: [number]) {
        const users_old= (await BadgeModel.BadgeGet(id)).users;
        await BadgeEdit(id, short, title, backgroundColor, fontColor, content, users, users_old);
        this.response.redirect=this.url('badge_detail', {id});
    }

    @param('id', Types.PositiveInt,true)
    async postDelete(domainId:string, id: number) {
        await BadgeModel.BadgeDel(id);
        this.response.redirect=this.url('badge_manage');
    }
}

class BadgeDetailHandler extends Handler {
    @param('id',Types.PositiveInt, true)
    async get(domainId:string, id: number){
        const badge = await BadgeModel.BadgeGet(id);
        if (!badge) throw new NotFoundError(`Badge ${id} is not exist!`);
        this.response.template = 'badge_detail.html';
        this.response.body = {
            badge: badge
        }
    }
}


export async function apply(ctx: Context) {
    ctx.Route('badge_manage', '/manage/badge', BadgeManageHandler, PRIV.PRIV_MANAGE_ALL_DOMAIN);
    ctx.Route('badge_add', '/badge/add', BadgeAddHandler, PRIV.PRIV_MANAGE_ALL_DOMAIN);
    ctx.Route('badge_edit', '/badge/:id/edit', BadgeEditHandler, PRIV.PRIV_MANAGE_ALL_DOMAIN);
    ctx.Route('badge_detail', '/badge/:id', BadgeDetailHandler);
    ctx.Route('user_badge_manage', '/mybadge', UserBadgeManageHandler, PRIV.PRIV_USER_PROFILE);
    ctx.injectUI('ControlPanel', 'badge_manage');
    ctx.injectUI('UserDropdown', 'user_badge_manage', (h) => ({icon: 'crown', displayName: 'user_badge_manage'}));
    ctx.i18n.load('zh', {
        'Badge': '徽章',
        'badge_manage': '徽章管理',
        'badge_add': '添加徽章',
        'badge_edit': '编辑徽章',
        'badge_detail': '徽章详情',
        'create at': '创建于',
        'badge ID': '徽章ID',
        'badge title': '徽章标题',
        'badge short': '徽章简称',
        'user_badge_manage': '我的徽章',
        'get at': '获取时间',
        'Enable': '启用',
        'badge background color': '徽章背景色',
        'badge font color': '徽章字体色',
        'hex color code': '十六进制颜色代码',
        'badge preview': '徽章预览',
        'badge assignment': '徽章分配',
    });
    ctx.i18n.load('en', {
        'Badge': 'Badge',
        'badge_manage': 'Badge Manage',
        'badge_add': 'Badge Add',
        'badge_edit': 'Badge Edit',
        'badge_detail': 'Badge Detail',
        'create at': 'Create At',
        'badge id': 'Badge ID',
        'badge title': 'Badge Title',
        'badge short': 'Badge Short',
        'user_badge_manage': 'My Badge',
        'get at': 'Get At',
        'enable': 'Enable',
        'badge background color': 'Badge Background Color',
        'badge font color': 'Badge Font Color',
        'hex color code': 'Hex Color Code',
        'badge preview': 'Badge Preview',
        'badge assignment': 'Badge Assignment',
    })
}
