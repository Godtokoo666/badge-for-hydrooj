import { Context, ObjectId } from 'hydrooj';
import { deleteUserCache } from 'hydrooj/src/model/user';
import { FindCursor, WithId } from 'mongodb';

export interface UserBadge {
    _id: ObjectId;
    owner: number;
    badgeId: number;
    getAt: Date;
}

export interface Badge {
    _id: number;
    short: string;
    title: string;
    backgroundColor: string;
    fontColor: string;
    content: string;
    users: [number];
    createAt: Date;
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

const UserBadgeModel = { userBadgeAdd, userBadgeGetMulti, userBadgeDel, userBadgeSel, userBadgeUnset: unsetUserBadge };
const BadgeModel = { badgeGetMulti, badgeAdd, badgeGet, badgeEdit, badgeDel };
global.Hydro.model.userBadge = UserBadgeModel;
global.Hydro.model.badge = BadgeModel;

async function setUserBadge(ctx: Context, userId: number, badgeId: number, badge: String): Promise<number> {
    const result = (await ctx.db.collection('user').findOneAndUpdate({ _id: userId }, { $set: { badgeId, badge } }));
    if (result) {
        deleteUserCache(result);
    }
    return result._id;
}

async function resetBadge(ctx: Context, badgeId: number, badge: String): Promise<number> {
    const result = (await ctx.db.collection('user').updateMany({ badgeId }, { $set: { badge } })).modifiedCount;
    if (result) {
        deleteUserCache(true);
    }
    return result;
}

async function unsetUserBadge(ctx: Context, userId: number): Promise<number> {
    const result = (await ctx.db.collection('user').findOneAndUpdate({ _id: userId }, { $unset: { badgeId: '', badge: '' } }));
    if (result) {
        deleteUserCache(result);
    }
    return result._id;
}

async function unsetBadge(ctx: Context, badgeId: number): Promise<number> {
    const result = (await ctx.db.collection('user').updateMany({ badgeId }, { $unset: { badgeId: '', badge: '' } })).modifiedCount;
    if (result) {
        deleteUserCache(true);
    }
    return result;
}

async function userBadgeAdd(ctx: Context, userId: number, badgeId: number): Promise<ObjectId> {
    const result = await ctx.db.collection('userBadge').insertOne({
        _id: new ObjectId(),
        owner: userId,
        badgeId,
        getAt: new Date()
    });
    return result.insertedId;
}

async function userBadgeGetMulti(ctx: Context, userId: number): Promise<FindCursor<WithId<UserBadge>>> {
    return ctx.db.collection('userBadge').find({ owner: userId }).sort({ badgeId: 1 });
}


async function userBadgeDel(ctx: Context, userId: number, badgeId: number): Promise<number> {
    if ((await ctx.db.collection('user').findOne({ _id: userId })).badgeId === badgeId) {
        await unsetUserBadge(ctx, userId);
    }
    return (await ctx.db.collection('userBadge').deleteOne({ owner: userId, badgeId })).deletedCount;
}

async function userBadgeSel(ctx: Context, userId: number, badgeId: number): Promise<number> {
    const userBadgeId = await ctx.db.collection('userBadge').findOne({ owner: userId, badgeId });
    if (userBadgeId) {
        const badge: Badge = await ctx.db.collection('badge').findOne({ _id: badgeId });
        const badgeid: number = badge._id;
        const payload: string = badge._id + '#' + badge.short + badge.backgroundColor + badge.fontColor + '#' + badge.title;
        return await setUserBadge(ctx, userId, badgeid, payload);
    }
    return 0;
}

async function badgeGetMulti(ctx: Context): Promise<FindCursor<WithId<Badge>>> {
    return ctx.db.collection('badge').find({});
}

async function badgeAdd(ctx: Context, short: string, title: string, backgroundColor: string, fontColor: string,content: string, users: [number],badgeId?: number,): Promise<number> {
    if (typeof badgeId !== 'number') {
        const [badge] = await ctx.db.collection('badge').find({}).sort({ _id: -1 }).limit(1).toArray();
        badgeId = Math.max((badge?._id || 0) + 1, 1);
    };
    const result = await ctx.db.collection('badge').insertOne({
        _id: badgeId,
        short,
        title,
        backgroundColor,
        fontColor,
        content,
        users,
        createAt: new Date()
    });
    if (users) {
        for (const userId of users) {
            await userBadgeAdd(ctx, userId, badgeId);
        }
    }
    return result.insertedId;
}

async function badgeGet(ctx: Context, badgeId: number): Promise<Badge> {
    return await ctx.db.collection('badge').findOne({ _id: badgeId });
}

async function badgeEdit(ctx: Context, badgeId: number, short: string, title: string, backgroundColor: string, fontColor: string, content: string, users: [number], users_old: [number]): Promise<number> {
    const result = await ctx.db.collection('badge').updateOne({ _id: badgeId }, {
        $set: {
            short,
            title,
            backgroundColor,
            fontColor,
            content,
            users
        }
    });
    if (users_old) {
        for (const userId of users_old) {
            if (!users || !users.includes(userId))
                await userBadgeDel(ctx, userId, badgeId);
        }
    }
    if (users) {
        for (const userId of users) {
            if (!users_old || !users_old.includes(userId))
                await userBadgeAdd(ctx, userId, badgeId);
        }
    }
    const badge: string = badgeId + '#' + short + backgroundColor + fontColor + '#' + title;
    await resetBadge(ctx, badgeId, badge);
    return result.modifiedCount;
}

async function badgeDel(ctx: Context, badgeId: number): Promise<number> {
    const result = await ctx.db.collection('badge').deleteOne({ _id: badgeId });
    await ctx.db.collection('userBadge').deleteMany({ badgeId });
    await unsetBadge(ctx, badgeId);
    return result.deletedCount;
}
