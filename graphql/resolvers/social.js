const User = require('../../models/user');
const { Comment, Message } = require('../models/Social');
const AppNotification = require('../models/AppNotification');
const Event = require('../../models/event');

function requireUser(context) {
    if (!context || !context.isAuth || !context.userId) {
        throw new Error('Please log in to continue.');
    }

    return context.userId;
}

async function notify({
    recipient,
    sender,
    type,
    message,
    referenceId = null,
}) {
    if (recipient.toString() === sender?.toString()) {
        return;
    }

    await AppNotification.create({
        recipient,
        sender: sender || null,
        type,
        message,
        referenceId,
    });
}

function userObject(user) {
    if (!user) return null;

    return {
        ...user._doc,
        _id: user.id,
        followers: async () => {
            const users = await User.find({
                _id: { $in: user.followers || [] },
            });
            return users;
        },
        following: async () => {
            const users = await User.find({
                _id: { $in: user.following || [] },
            });
            return users;
        },
        followerCount: (user.followers || []).length,
        followingCount: (user.following || []).length,
    };
}

function commentObject(comment) {
    return {
        ...comment._doc,
        _id: comment.id,
        user: async () => {
            const u = await User.findById(comment.user);
            return userObject(u);
        },
        event: async () => {
            return Event.findById(comment.event);
        },
        likes: async () => {
            return User.find({
                _id: { $in: comment.likes || [] },
            });
        },
        likeCount: (comment.likes || []).length,
        createdAt: new Date(comment.createdAt).toISOString(),
        updatedAt: new Date(comment.updatedAt).toISOString(),
    };
}

function messageObject(message) {
    return {
        ...message._doc,
        _id: message.id,
        sender: async () => userObject(await User.findById(message.sender)),
        recipient: async () => userObject(await User.findById(message.recipient)),
        createdAt: new Date(message.createdAt).toISOString(),
        updatedAt: new Date(message.updatedAt).toISOString(),
    };
}

module.exports = {
    userObject,
    commentObject,
    messageObject,

    followUser: async (args, context) => {
        const userId = requireUser(context);

        if (userId === args.userId) {
            throw new Error('You cannot follow yourself.');
        }

        const [me, target] = await Promise.all([
            User.findById(userId),
            User.findById(args.userId),
        ]);

        if (!target) {
            throw new Error('User not found.');
        }

        if (!me.following.some(id => id.toString() === target._id.toString())) {
            me.following.push(target._id);
        }

        if (!target.followers.some(id => id.toString() === me._id.toString())) {
            target.followers.push(me._id);
        }

        await me.save();
        await target.save();

        await notify({
            recipient: target._id,
            sender: me._id,
            type: 'FOLLOW',
            message: `${me.firstName || me.email} started following you.`,
            referenceId: me._id,
        });

        return userObject(target);
    },

    unfollowUser: async (args, context) => {
        const userId = requireUser(context);

        const [me, target] = await Promise.all([
            User.findById(userId),
            User.findById(args.userId),
        ]);

        if (!target) {
            throw new Error('User not found.');
        }

        me.following = me.following.filter(
            id => id.toString() !== target._id.toString()
        );

        target.followers = target.followers.filter(
            id => id.toString() !== me._id.toString()
        );

        await me.save();
        await target.save();

        return userObject(target);
    },

    createComment: async (args, context) => {
        const userId = requireUser(context);

        const event = await Event.findById(args.input.eventId);

        if (!event) {
            throw new Error('Event not found.');
        }

        const text = String(args.input.text || '').trim();

        if (!text) {
            throw new Error('Comment cannot be empty.');
        }

        const comment = await Comment.create({
            event: event._id,
            user: userId,
            text,
        });

        await notify({
            recipient: event.creator,
            sender: userId,
            type: 'COMMENT',
            message: 'Someone commented on your event.',
            referenceId: comment._id,
        });

        return commentObject(comment);
    },

    deleteComment: async (args, context) => {
        const userId = requireUser(context);

        const comment = await Comment.findById(args.commentId);

        if (!comment) {
            throw new Error('Comment not found.');
        }

        if (comment.user.toString() !== userId.toString()) {
            throw new Error('You can only delete your own comments.');
        }

        await Comment.deleteOne({ _id: comment._id });

        return commentObject(comment);
    },

    likeComment: async (args, context) => {
        const userId = requireUser(context);

        const comment = await Comment.findById(args.commentId);

        if (!comment) {
            throw new Error('Comment not found.');
        }

        if (!comment.likes.some(id => id.toString() === userId.toString())) {
            comment.likes.push(userId);
            await comment.save();

            if (comment.user.toString() !== userId.toString()) {
                await notify({
                    recipient: comment.user,
                    sender: userId,
                    type: 'LIKE',
                    message: 'Someone liked your comment.',
                    referenceId: comment._id,
                });
            }
        }

        return commentObject(comment);
    },

    unlikeComment: async (args, context) => {
        const userId = requireUser(context);

        const comment = await Comment.findById(args.commentId);

        if (!comment) {
            throw new Error('Comment not found.');
        }

        comment.likes = comment.likes.filter(
            id => id.toString() !== userId.toString()
        );

        await comment.save();

        return commentObject(comment);
    },

    createCommentQuery: async (args) => {
        const comments = await Comment.find({
            event: args.eventId,
        }).sort({ createdAt: -1 });

        return comments.map(commentObject);
    },

    sendMessage: async (args, context) => {
        const userId = requireUser(context);

        if (userId === args.recipientId) {
            throw new Error('You cannot message yourself.');
        }

        const recipient = await User.findById(args.recipientId);

        if (!recipient) {
            throw new Error('Recipient not found.');
        }

        const text = String(args.text || '').trim();

        if (!text) {
            throw new Error('Message cannot be empty.');
        }

        const message = await Message.create({
            sender: userId,
            recipient: recipient._id,
            text,
        });

        await notify({
            recipient: recipient._id,
            sender: userId,
            type: 'MESSAGE',
            message: 'You received a new message.',
            referenceId: message._id,
        });

        return messageObject(message);
    },

    messagesQuery: async (args, context) => {
        const userId = requireUser(context);

        const otherUser = await User.findById(args.userId);

        if (!otherUser) {
            throw new Error('User not found.');
        }

        const messages = await Message.find({
            $or: [
                {
                    sender: userId,
                    recipient: args.userId,
                },
                {
                    sender: args.userId,
                    recipient: userId,
                },
            ],
        }).sort({ createdAt: 1 });

        return messages.map(messageObject);
    },

    unreadMessageCount: async (_args, context) => {
        const userId = requireUser(context);

        return Message.countDocuments({
            recipient: userId,
            read: false,
        });
    },

    markMessageRead: async (args, context) => {
        const userId = requireUser(context);

        const message = await Message.findOne({
            _id: args.messageId,
            recipient: userId,
        });

        if (!message) {
            throw new Error('Message not found.');
        }

        message.read = true;
        await message.save();

        return messageObject(message);
    },
};
