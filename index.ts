import { Context, Handler, NotFoundError, param, PRIV, Types } from 'hydrooj';
import { Badge } from './model';

const UserBadgeModel = global.Hydro.model.userBadge;
const BadgeModel = global.Hydro.model.badge;

const user = global.Hydro.model.user;

class UserBadgeManageHandler extends Handler {

    @param('page', Types.PositiveInt, true)
    async get(_: string, page = 1, userId = this.user._id) {
        const [ddocs, dpcount] = await this.ctx.db.paginate(
            await UserBadgeModel.userBadgeGetMulti(this.ctx, userId),
            page,
            10
        );
        const result = await (await BadgeModel.badgeGetMulti(this.ctx)).toArray();
        const bdocs = Object.fromEntries(result.reduce((acc, item) => {
            acc.set(item._id, item);
            return acc;
        }, new Map<number, Badge>()));
        this.response.template = 'user_badge_manage.html';
        const current_badge = (await this.ctx.db.collection('user').findOne({ _id: userId })).badge;
        this.response.body = { ddocs, bdocs, dpcount, page, current_badge };
    }

    @param('badgeId', Types.PositiveInt, true)
    async postEnable(_: string, badgeId: number) {
        await UserBadgeModel.userBadgeSel(this.ctx, this.user._id, badgeId);
        this.response.redirect = this.url('user_badge_manage');
    }

    async postReset(_: string) {
        await UserBadgeModel.userBadgeUnset(this.ctx, this.user._id);
        this.response.redirect = this.url('user_badge_manage');
    }
}

class BadgeManageHandler extends Handler {

    @param('page', Types.PositiveInt, true)
    async get(_: string, page = 1) {
        const[ddocs, dpcount] = await this.ctx.db.paginate(
            await BadgeModel.badgeGetMulti(this.ctx),
            page,
            10
        );
        this.response.template = 'badge_manage.html';
        this.response.body = { ddocs, dpcount, page };
    }
}

class BadgeAddHandler extends Handler {

    async get() {
        this.response.template = 'badge_add.html';
    }

    @param('short', Types.String)
    @param('title', Types.String)
    @param('backgroundColor', Types.String)
    @param('fontColor', Types.String)
    @param('content', Types.Content)
    @param('users', Types.NumericArray, true)
    async postAdd(_: string, short: string, title: string, backgroundColor: string, fontColor: string, content: string, users: [number]) {
        const badgeId = await BadgeModel.badgeAdd(this.ctx, short, title, backgroundColor, fontColor, content, users);
        this.response.redirect = this.url('badge_detail', { id: badgeId });
    }
}

class BadgeEditHandler extends Handler {

    @param('id', Types.PositiveInt, true)
    async get(_: string, id: number) {
        const badge = await BadgeModel.badgeGet(this.ctx, id);
        if (!badge) throw new NotFoundError(`Badge ${id} is not exist!`);
        this.response.template = 'badge_edit.html';
        this.response.body = { badge };
    }

    @param('id', Types.PositiveInt, true)
    @param('short', Types.String)
    @param('title', Types.String)
    @param('backgroundColor', Types.String)
    @param('fontColor', Types.String)
    @param('content', Types.Content)
    @param('users', Types.NumericArray, true)
    async postUpdate(_: string, id: number, short: string, title: string, backgroundColor: string, fontColor: string, content: string, users: [number]) {
        const users_old = (await BadgeModel.badgeGet(this.ctx, id)).users;
        await BadgeModel.badgeEdit(this.ctx, id, short, title, backgroundColor, fontColor, content, users, users_old);
        this.response.redirect = this.url('badge_detail', { id });
    }

    @param('id', Types.PositiveInt, true)
    async postDelete(_:string, id: number) {
        await BadgeModel.badgeDel(this.ctx, id);
        this.response.redirect = this.url('badge_manage');
    }
}

class BadgeDetailHandler extends Handler {
    
    @param('id', Types.PositiveInt, true)
    async get(domainId: string, id: number) {
        const badge = await BadgeModel.badgeGet(this.ctx, id);
        if (!badge) throw new NotFoundError(`Badge ${id} is not exist!`);
        const udict = await user.getList(domainId, badge.users);
        this.response.template = 'badge_detail.html';
        this.response.body = { badge, udict };
    }
}


export async function apply(ctx: Context) {
    ctx.Route('badge_manage', '/manage/badge', BadgeManageHandler, PRIV.PRIV_MANAGE_ALL_DOMAIN);
    ctx.Route('badge_add', '/badge/add', BadgeAddHandler, PRIV.PRIV_MANAGE_ALL_DOMAIN);
    ctx.Route('badge_edit', '/badge/:id/edit', BadgeEditHandler, PRIV.PRIV_MANAGE_ALL_DOMAIN);
    ctx.Route('badge_detail', '/badge/:id', BadgeDetailHandler);
    ctx.Route('user_badge_manage', '/mybadge', UserBadgeManageHandler, PRIV.PRIV_USER_PROFILE);
    ctx.injectUI('ControlPanel', 'badge_manage');
    ctx.injectUI('UserDropdown', 'user_badge_manage', () => ({ icon: 'crown', displayName: 'user_badge_manage' }));
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
        'User to assign this badge': '欲分配此徽章的用户',
        'Display name, max 3 chars recommended': '显示名，建议3字以内',
        'Also used as badge hover text': '另作徽章悬停时内容',
        'Badge Owners': '持有徽章',
        'Sorry, there are no badges.': '抱歉，这里没有徽章。',
        'Sorry, You don\'t have any badge.': '抱歉，你还没有徽章。',
        'Hover over a badge to view its title; click a badge to open its introduction page.': '鼠标悬停至徽章可查看徽章标题，单击徽章可打开徽章介绍页。',
        'If you have any questions about badge validity, please contact the administrator.': '对徽章存续等有任何问题的，请联系站点管理员。',
        'Current Badge': '当前徽章',
        'No Badge Enabled': '您暂未启用任何徽章',
        'Reset Badge': '重置徽章',
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
        'User to assign this badge': 'User to assign this badge',
        'Display name, max 3 chars recommended': 'Display name, max 3 chars recommended',
        'Also used as badge hover text': 'Also used as badge hover text',
        'Badge Owners': 'Badge Owners',
        'Sorry, there are no badges.': 'Sorry, there are no badges.',
        'Sorry, You don\'t have any badge.': 'Sorry, You don\'t have any badge.',
        'Hover over a badge to view its title; click a badge to open its introduction page.': 'Hover over a badge to view its title; click a badge to open its introduction page.',
        'If you have any questions about badge validity, please contact the administrator.': 'If you have any questions about badge validity, please contact the administrator.',
        'Current Badge': 'Current Badge',
        'No Badge Enabled': 'No Badge Enabled',
        'Reset Badge': 'Reset Badge',
    });
}
