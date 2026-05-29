const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;

const CHINA_TIME_OFFSET_MS = 8 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const POST_EXPIRE_GRACE_MS = 60 * 60 * 1000;
const LIST_FETCH_LIMIT = 200;
const CATEGORY_OPTIONS = ['学习', '干饭', '运动', '游戏', '聊天', '散步', '桌游', '旅游', '拼单', '其他'];
const DELETE_PENALTY_WINDOW_MS = ONE_DAY_MS;
const DELETE_PENALTY_THRESHOLD = 3;
const DELETE_PENALTY_HOURS = 1;

const getWxContext = () => cloud.getWXContext();

const getOpenId = async () => {
  const wxContext = getWxContext();
  return {
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID,
  };
};

const getMiniProgramCode = async () => {
  const resp = await cloud.openapi.wxacode.get({
    path: 'pages/index/index',
  });
  const upload = await cloud.uploadFile({
    cloudPath: 'code.png',
    fileContent: resp.buffer,
  });
  return upload.fileID;
};

const normalizeText = (value, maxLength = 200) => {
  return String(value || '').trim().slice(0, maxLength);
};

const normalizeStringArray = (value, maxItems = 8, maxLength = 20) => {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => normalizeText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
};

const chunkArray = (list, chunkSize = 20) => {
  const chunks = [];
  for (let index = 0; index < list.length; index += chunkSize) {
    chunks.push(list.slice(index, index + chunkSize));
  }
  return chunks;
};

const isValidPhone = phone => /^\d{11}$/.test(String(phone || ''));

const pickSystemInfo = (system = {}) => ({
  model: normalizeText(system.model, 80),
  system: normalizeText(system.system, 80),
  platform: normalizeText(system.platform, 30),
  version: normalizeText(system.version, 30),
  SDKVersion: normalizeText(system.SDKVersion, 30)
});

const addFeedbackRecord = async data => {
  try {
    return await db.collection('feedbacks').add({ data });
  } catch (err) {
    const message = `${err.errMsg || err.message || ''}`;
    const isMissingCollection = message.includes('collection not exist') ||
      message.includes('collection not exists') ||
      message.includes('集合不存在');

    if (!isMissingCollection || typeof db.createCollection !== 'function') {
      throw err;
    }

    await db.createCollection('feedbacks').catch(() => null);
    return await db.collection('feedbacks').add({ data });
  }
};

const isMissingCollectionError = err => {
  const message = `${err.errMsg || err.message || ''}`;
  return message.includes('collection not exist') ||
    message.includes('collection not exists') ||
    message.includes('集合不存在');
};

const addCollectionRecord = async (collectionName, data) => {
  try {
    return await db.collection(collectionName).add({ data });
  } catch (err) {
    if (!isMissingCollectionError(err) || typeof db.createCollection !== 'function') {
      throw err;
    }

    await db.createCollection(collectionName).catch(() => null);
    return await db.collection(collectionName).add({ data });
  }
};

const safeCollectionGet = async (collectionName, buildQuery) => {
  try {
    return await buildQuery(db.collection(collectionName)).get();
  } catch (err) {
    if (isMissingCollectionError(err)) {
      return { data: [] };
    }
    throw err;
  }
};

const formatChinaDateTimeText = (timestamp = Date.now()) => {
  const chinaDate = new Date(timestamp + CHINA_TIME_OFFSET_MS);
  const year = chinaDate.getUTCFullYear();
  const month = `${chinaDate.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${chinaDate.getUTCDate()}`.padStart(2, '0');
  const hour = `${chinaDate.getUTCHours()}`.padStart(2, '0');
  const minute = `${chinaDate.getUTCMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
};

const formatPenaltyRemain = expireAtTs => {
  const remainMs = Math.max(Number(expireAtTs || 0) - Date.now(), 0);
  const remainHours = Math.ceil(remainMs / (60 * 60 * 1000));
  if (remainHours >= 24) {
    const days = Math.floor(remainHours / 24);
    const hours = remainHours % 24;
    return hours ? `${days}天${hours}小时` : `${days}天`;
  }
  return `${Math.max(remainHours, 1)}小时`;
};

const buildJoinNotifyPayload = (post, joinedUser, remain) => {
  const rawType = normalizeText(post.type, 20);
  const customType = normalizeText(post.custom_type, 20);
  const activityName = normalizeText(
    rawType === '其他' ? (customType || rawType) : (rawType || customType || '校园搭子'),
    20
  );
  const eventTime = normalizeText(`${post.date || ''} ${post.time || ''}`.trim(), 40);

  return {
    activityName,
    postTitle: activityName,
    joinerName: normalizeText(joinedUser.nickname || '新同学', 20),
    joinerGender: normalizeText(joinedUser.gender || '未填写', 20),
    eventTime,
    eventPlace: normalizeText(post.location || '地点待定', 40),
    joinTime: formatChinaDateTimeText(),
    remainText: normalizeText(remain <= 0 ? '已满员' : `还缺 ${remain} 人`, 20)
  };
};

const buildJoinNotifyData = (post, joinedUser, remain, notifyConfig = {}) => {
  const dataMap = notifyConfig.dataMap || notifyConfig.dataKeys || {};
  const payload = buildJoinNotifyPayload(post, joinedUser, remain);
  const data = {};

  Object.entries(dataMap).forEach(([fieldKey, templateKey]) => {
    const safeTemplateKey = normalizeText(templateKey, 40);
    const value = payload[fieldKey];
    if (!safeTemplateKey || !value) {
      return;
    }

    data[safeTemplateKey] = { value };
  });

  return data;
};

const sendJoinNotify = async (post, joinedUser, remain, notifyConfig = {}) => {
  const templateId = normalizeText(notifyConfig.templateId, 200);
  if (!templateId) {
    return { skipped: true, reason: 'NO_TEMPLATE_ID' };
  }

  const touser = normalizeText(post.creator_openid || post._openid, 64);
  if (!touser) {
    return { skipped: true, reason: 'NO_RECIPIENT' };
  }

  const data = buildJoinNotifyData(post, joinedUser, remain, notifyConfig);
  if (!Object.keys(data).length) {
    return { skipped: true, reason: 'NO_MESSAGE_DATA' };
  }

  let page = normalizeText(notifyConfig.page || `pkg-extra/detail/detail?id=${post._id}`, 255);
  if (!page) {
    page = `pkg-extra/detail/detail?id=${post._id}`;
  } else if (!page.includes('?')) {
    page = `${page}?id=${post._id}`;
  }

  await cloud.openapi.subscribeMessage.send({
    touser,
    templateId,
    page,
    data
  });

  return { skipped: false };
};

const getJoinNotifyEnabled = async (openid, templateId) => {
  const safeOpenid = normalizeText(openid, 64);
  const safeTemplateId = normalizeText(templateId, 200);

  if (!safeOpenid || !safeTemplateId) {
    return false;
  }

  const res = await db.collection('users')
    .where({
      _openid: safeOpenid,
      join_notify_enabled: true,
      join_notify_template_id: safeTemplateId
    })
    .limit(1)
    .get();

  return res.data.length > 0;
};

const consumeJoinNotifyStatus = async (openid, templateId) => {
  const safeOpenid = normalizeText(openid, 64);
  const safeTemplateId = normalizeText(templateId, 200);

  if (!safeOpenid || !safeTemplateId) {
    return;
  }

  await db.collection('users')
    .where({
      _openid: safeOpenid,
      join_notify_template_id: safeTemplateId
    })
    .update({
      data: {
        join_notify_enabled: false,
        join_notify_update_time: db.serverDate(),
        update_time: db.serverDate()
      }
    });
};

const buildChatNotifyPayload = (conversation, message) => {
  const postTitle = normalizeText(conversation.post_title || '校园邀约', 12);
  return {
    senderName: normalizeText(message.sender_name || '民大同学', 20),
    messageContent: normalizeText(message.content || '发来一条新消息', 20),
    postTitle,
    noticeTitle: normalizeText(`${postTitle}有新消息`, 20),
    senderSide: '小民搭子',
    sendTime: formatChinaDateTimeText(message.create_ts || Date.now())
  };
};

const buildChatNotifyData = (conversation, message, notifyConfig = {}) => {
  const dataMap = notifyConfig.dataMap || notifyConfig.dataKeys || {};
  const payload = buildChatNotifyPayload(conversation, message);
  const data = {};

  Object.entries(dataMap).forEach(([fieldKey, templateKey]) => {
    const safeTemplateKey = normalizeText(templateKey, 40);
    const value = payload[fieldKey];
    if (!safeTemplateKey || !value) {
      return;
    }

    data[safeTemplateKey] = { value };
  });

  return data;
};

const sendChatNotify = async (conversation, message, receiverOpenid, notifyConfig = {}) => {
  const templateId = normalizeText(notifyConfig.templateId, 200);
  const touser = normalizeText(receiverOpenid, 64);

  if (!templateId) {
    return { skipped: true, reason: 'NO_TEMPLATE_ID' };
  }
  if (!touser) {
    return { skipped: true, reason: 'NO_RECIPIENT' };
  }

  const data = buildChatNotifyData(conversation, message, notifyConfig);
  if (!Object.keys(data).length) {
    return { skipped: true, reason: 'NO_MESSAGE_DATA' };
  }

  let page = normalizeText(notifyConfig.page || `pkg-extra/chat/chat?conversationId=${conversation._id}`, 255);
  if (!page) {
    page = `pkg-extra/chat/chat?conversationId=${conversation._id}`;
  } else if (!page.includes('?')) {
    page = `${page}?conversationId=${conversation._id}`;
  }

  await cloud.openapi.subscribeMessage.send({
    touser,
    templateId,
    page,
    data
  });

  return { skipped: false };
};

const getChatNotifyEnabled = async (openid, templateId) => {
  const safeOpenid = normalizeText(openid, 64);
  const safeTemplateId = normalizeText(templateId, 200);

  if (!safeOpenid || !safeTemplateId) {
    return false;
  }

  const res = await db.collection('users')
    .where({
      _openid: safeOpenid,
      chat_notify_enabled: true,
      chat_notify_template_id: safeTemplateId
    })
    .limit(1)
    .get();

  return res.data.length > 0;
};

const consumeChatNotifyStatus = async (openid, templateId) => {
  const safeOpenid = normalizeText(openid, 64);
  const safeTemplateId = normalizeText(templateId, 200);

  if (!safeOpenid || !safeTemplateId) {
    return;
  }

  await db.collection('users')
    .where({
      _openid: safeOpenid,
      chat_notify_template_id: safeTemplateId
    })
    .update({
      data: {
        chat_notify_enabled: false,
        chat_notify_update_time: db.serverDate(),
        update_time: db.serverDate()
      }
    });
};

const parseChinaDateTime = (dateText, timeText) => {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateText || ''));
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(String(timeText || ''));

  if (!dateMatch || !timeMatch) {
    return NaN;
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]) - 1;
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  return Date.UTC(year, month, day, hour, minute) - CHINA_TIME_OFFSET_MS;
};

const getChinaDateParts = (timestamp = Date.now()) => {
  const chinaDate = new Date(timestamp + CHINA_TIME_OFFSET_MS);
  return {
    year: chinaDate.getUTCFullYear(),
    month: chinaDate.getUTCMonth(),
    day: chinaDate.getUTCDate(),
  };
};

const getChinaDayStart = (timestamp = Date.now()) => {
  const { year, month, day } = getChinaDateParts(timestamp);
  return Date.UTC(year, month, day) - CHINA_TIME_OFFSET_MS;
};

const getDisplayRange = (nowTimestamp = Date.now()) => {
  const todayStart = getChinaDayStart(nowTimestamp);
  const tomorrowStart = todayStart + ONE_DAY_MS;
  const dayAfterTomorrowStart = tomorrowStart + ONE_DAY_MS;

  return {
    todayStart,
    tomorrowStart,
    dayAfterTomorrowStart,
  };
};

const resolveCategory = (rawCategory, rawType) => {
  const category = normalizeText(rawCategory, 20);
  if (CATEGORY_OPTIONS.includes(category)) {
    return category;
  }

  const type = normalizeText(rawType, 20);
  return CATEGORY_OPTIONS.includes(type) ? type : '其他';
};

const resolveDisplayType = (category, rawType, rawCustomType) => {
  const customType = normalizeText(rawCustomType, 20);
  const type = normalizeText(rawType, 20);

  if (category === '其他') {
    return customType || (type && type !== '其他' ? type : '其他');
  }

  return type || category;
};

const getDayLabel = (eventTimestamp, nowTimestamp = Date.now()) => {
  const { todayStart, tomorrowStart, dayAfterTomorrowStart } = getDisplayRange(nowTimestamp);

  if (eventTimestamp >= todayStart && eventTimestamp < tomorrowStart) {
    return '今天';
  }
  if (eventTimestamp >= tomorrowStart && eventTimestamp < dayAfterTomorrowStart) {
    return '明天';
  }
  if (eventTimestamp >= dayAfterTomorrowStart) {
    return '以后';
  }
  return '';
};

const buildPostForClient = (rawPost, nowTimestamp = Date.now()) => {
  const category = resolveCategory(rawPost.category, rawPost.type);
  const eventTimestamp = Number(rawPost.event_timestamp) || parseChinaDateTime(rawPost.date, rawPost.time);
  const type = resolveDisplayType(category, rawPost.type, rawPost.custom_type);

  return {
    ...rawPost,
    category,
    type,
    custom_type: normalizeText(rawPost.custom_type, 20),
    event_timestamp: eventTimestamp,
    creator_answer_tags: normalizeStringArray(rawPost.creator_answer_tags, 8, 16),
    day_label: getDayLabel(eventTimestamp, nowTimestamp),
  };
};

const isPostExpired = (post, nowTimestamp = Date.now()) => {
  return Number.isFinite(post.event_timestamp) && post.event_timestamp < nowTimestamp - POST_EXPIRE_GRACE_MS;
};

const isWithinDisplayRange = (post, nowTimestamp = Date.now()) => {
  return Number.isFinite(post.event_timestamp);
};

const sortPostsByEventTime = posts => {
  return [...posts].sort((left, right) => {
    if (left.event_timestamp !== right.event_timestamp) {
      return left.event_timestamp - right.event_timestamp;
    }
    return String(left._id || '').localeCompare(String(right._id || ''));
  });
};

const getContactMap = async postIds => {
  if (!postIds.length) return {};

  const map = {};
  const chunks = chunkArray(postIds, 20);

  for (const ids of chunks) {
    const res = await db.collection('post_contacts')
      .where({ post_id: _.in(ids) })
      .get();

    res.data.forEach(item => {
      map[item.post_id] = item.phone;
    });
  }

  return map;
};

const removePostsByIds = async postIds => {
  if (!postIds.length) return;

  const chunks = chunkArray(postIds, 20);

  for (const ids of chunks) {
    await db.collection('post_contacts').where({ post_id: _.in(ids) }).remove();
    await Promise.all(ids.map(id => db.collection('posts').doc(id).remove().catch(() => null)));
  }
};

const cleanupExpiredPosts = async () => {
  const expireBefore = Date.now() - POST_EXPIRE_GRACE_MS;

  while (true) {
    const res = await db.collection('posts')
      .where({ event_timestamp: _.lt(expireBefore) })
      .limit(100)
      .get();

    if (!res.data.length) {
      break;
    }

    await removePostsByIds(res.data.map(item => item._id));

    if (res.data.length < 100) {
      break;
    }
  }
};

const pruneExpiredPosts = async (records, nowTimestamp = Date.now()) => {
  const activePosts = [];
  const expiredPostIds = [];

  records.forEach(record => {
    const post = buildPostForClient(record, nowTimestamp);
    if (!Number.isFinite(post.event_timestamp)) {
      return;
    }

    if (isPostExpired(post, nowTimestamp)) {
      expiredPostIds.push(post._id);
      return;
    }

    activePosts.push(post);
  });

  if (expiredPostIds.length) {
    await removePostsByIds(expiredPostIds);
  }

  return activePosts;
};

const canSeeContact = (post, openid) => {
  if (post._openid === openid || post.creator_openid === openid) {
    return true;
  }

  const joinedOpenids = post.joined_openids || [];
  return joinedOpenids.includes(openid);
};

const getActiveDeletePenalty = async openid => {
  const safeOpenid = normalizeText(openid, 64);
  if (!safeOpenid) return null;

  const nowTs = Date.now();
  const res = await safeCollectionGet('creator_penalties', collection => collection
    .where({
      _openid: safeOpenid,
      type: 'delete_joined_post',
      create_ts: _.gt(nowTs - DELETE_PENALTY_WINDOW_MS)
    })
    .limit(100));

  if (res.data.length < DELETE_PENALTY_THRESHOLD) return null;

  const latestRecord = res.data
    .sort((left, right) => Number(right.create_ts || 0) - Number(left.create_ts || 0))[0];
  const expireAtTs = Number(latestRecord.create_ts || 0) + DELETE_PENALTY_HOURS * 60 * 60 * 1000;
  if (expireAtTs <= nowTs) return null;

  return {
    ...latestRecord,
    penalty_hours: DELETE_PENALTY_HOURS,
    expire_at_ts: expireAtTs
  };
};

const createDeletePenalty = async (openid, post, joinedCount) => {
  const nowTs = Date.now();
  const recentRes = await safeCollectionGet('creator_penalties', collection => collection
    .where({
      _openid: openid,
      type: 'delete_joined_post',
      create_ts: _.gt(nowTs - DELETE_PENALTY_WINDOW_MS)
    })
    .limit(100));
  const recentCount = recentRes.data.length + 1;
  const shouldApplyPenalty = recentCount >= DELETE_PENALTY_THRESHOLD;
  const penaltyHours = shouldApplyPenalty ? DELETE_PENALTY_HOURS : 0;
  const expireAtTs = shouldApplyPenalty ? nowTs + penaltyHours * 60 * 60 * 1000 : 0;

  await addCollectionRecord('creator_penalties', {
    _openid: openid,
    type: 'delete_joined_post',
    post_id: post._id,
    post_type: normalizeText(post.type, 40),
    joined_count: joinedCount,
    recent_count: recentCount,
    penalty_hours: penaltyHours,
    expire_at_ts: expireAtTs,
    create_ts: nowTs,
    create_time: db.serverDate()
  });

  if (!shouldApplyPenalty) {
    return null;
  }

  return {
    penaltyHours,
    expireAtTs,
    remainText: formatPenaltyRemain(expireAtTs)
  };
};

const addUserNotification = async data => {
  return await addCollectionRecord('notifications', {
    ...data,
    read: false,
    create_ts: Date.now(),
    create_time: db.serverDate()
  });
};

const notifyJoinedUsersPostDeleted = async (post, joinedOpenids, creatorOpenid) => {
  const uniqueRecipients = [...new Set(joinedOpenids)]
    .map(openid => normalizeText(openid, 64))
    .filter(openid => openid && openid !== creatorOpenid);

  if (!uniqueRecipients.length) {
    return 0;
  }

  const postTitle = normalizeText(post.type || '校园邀约', 40);
  const eventTime = normalizeText(`${post.day_label ? `${post.day_label} · ` : ''}${post.date || ''} ${post.time || ''}`.trim(), 80);
  const content = `你加入的「${postTitle}」已被发起人删除，原定 ${eventTime || '时间待定'}，地点：${post.location || '地点待定'}。`;

  const results = await Promise.all(uniqueRecipients.map(openid => addUserNotification({
    recipient_openid: openid,
    sender_openid: creatorOpenid,
    type: 'post_deleted',
    title: '邀约已被删除',
    content,
    related_post_id: post._id,
    post_title: postTitle
  }).catch(err => {
    console.warn('保存删除通知失败:', err);
    return null;
  })));

  return results.filter(Boolean).length;
};

const markPostConversationsDeleted = async post => {
  const res = await safeCollectionGet('chat_conversations', collection => collection
    .where({ post_id: post._id })
    .limit(100));

  await Promise.all(res.data.map(item => db.collection('chat_conversations').doc(item._id).update({
    data: {
      post_deleted: true,
      post_title: normalizeText(post.type || item.post_title || '校园邀约', 40),
      update_ts: Date.now(),
      update_time: db.serverDate()
    }
  }).catch(() => null)));
};

const createPost = async event => {
  const { OPENID } = getWxContext();
  const post = event.post || {};
  const phone = normalizeText(event.phone, 20);
  const nowTimestamp = Date.now();
  const currentMinuteStart = Math.floor(nowTimestamp / 60000) * 60000;
  const category = resolveCategory(post.category, post.type);
  const type = resolveDisplayType(category, post.type, post.custom_type);
  const eventTimestamp = parseChinaDateTime(post.date, post.time);

  if (!OPENID) {
    return { success: false, code: 'NO_LOGIN', message: '请先登录' };
  }

  const activePenalty = await getActiveDeletePenalty(OPENID);
  if (activePenalty) {
    return {
      success: false,
      code: 'DELETE_PENALTY_ACTIVE',
      message: `你删除过已有同学加入的帖子，当前处于发布冷静期，还需 ${formatPenaltyRemain(activePenalty.expire_at_ts)} 后才能再次发布。`
    };
  }

  if (!isValidPhone(phone)) {
    return { success: false, code: 'INVALID_PHONE', message: '手机号格式不正确' };
  }

  const totalPeople = Number(post.total_people);
  if (!type || !post.date || !post.time || !post.location || !totalPeople || !post.gender) {
    return { success: false, code: 'INVALID_POST', message: '发布信息不完整' };
  }

  if (!Number.isFinite(eventTimestamp)) {
    return { success: false, code: 'INVALID_TIME', message: '请选择有效的日期和时间' };
  }

  if (eventTimestamp < currentMinuteStart) {
    return { success: false, code: 'PAST_TIME', message: '不能发布已经过去的邀约时间' };
  }

  await cleanupExpiredPosts();

  const postData = {
    _openid: OPENID,
    creator_openid: OPENID,
    school: '中央民族大学',
    category,
    type,
    custom_type: category === '其他' ? normalizeText(post.custom_type || type, 20) : '',
    date: normalizeText(post.date, 20),
    time: normalizeText(post.time, 20),
    event_timestamp: eventTimestamp,
    location: normalizeText(post.location, 80),
    total_people: Math.max(totalPeople, 1),
    initial_people: Math.max(totalPeople, 1),
    note: normalizeText(post.note, 300),
    gender: normalizeText(post.gender, 20),
    creator_name: normalizeText(post.creator_name, 40),
    creator_avatar: normalizeText(post.creator_avatar, 300),
    creator_tag: normalizeText(post.creator_tag, 40),
    creator_mbti: normalizeText(post.creator_mbti, 10),
    creator_gender: normalizeText(post.creator_gender, 20),
    creator_hobbies: normalizeText(post.creator_hobbies, 120),
    creator_answer_tags: normalizeStringArray(post.creator_answer_tags, 8, 16),
    joined_openids: [],
    joined_users: [],
    status: 'open',
    create_time: db.serverDate(),
    update_time: db.serverDate()
  };

  const addRes = await db.collection('posts').add({ data: postData });

  await db.collection('post_contacts').add({
    data: {
      _openid: OPENID,
      post_id: addRes._id,
      phone,
      create_time: db.serverDate(),
      update_time: db.serverDate()
    }
  });

  return {
    success: true,
    postId: addRes._id
  };
};

const buildPostUpdateData = (post, eventTimestamp) => {
  const category = resolveCategory(post.category, post.type);
  const type = resolveDisplayType(category, post.type, post.custom_type);
  const totalPeople = Math.max(Number(post.total_people), 0);

  return {
    category,
    type,
    custom_type: category === '其他' ? normalizeText(post.custom_type || type, 20) : '',
    date: normalizeText(post.date, 20),
    time: normalizeText(post.time, 20),
    event_timestamp: eventTimestamp,
    location: normalizeText(post.location, 80),
    total_people: totalPeople,
    note: normalizeText(post.note, 300),
    gender: normalizeText(post.gender, 20),
    creator_name: normalizeText(post.creator_name, 40),
    creator_avatar: normalizeText(post.creator_avatar, 300),
    creator_tag: normalizeText(post.creator_tag, 40),
    creator_mbti: normalizeText(post.creator_mbti, 10),
    creator_gender: normalizeText(post.creator_gender, 20),
    creator_hobbies: normalizeText(post.creator_hobbies, 120),
    creator_answer_tags: normalizeStringArray(post.creator_answer_tags, 8, 16),
    status: totalPeople <= 0 ? 'full' : 'open',
    update_time: db.serverDate()
  };
};

const updatePost = async event => {
  const { OPENID } = getWxContext();
  const postId = event.postId;
  const post = event.post || {};
  const phone = normalizeText(event.phone, 20);
  const nowTimestamp = Date.now();
  const currentMinuteStart = Math.floor(nowTimestamp / 60000) * 60000;
  const eventTimestamp = parseChinaDateTime(post.date, post.time);

  if (!OPENID) {
    return { success: false, code: 'NO_LOGIN', message: '请先登录' };
  }
  if (!postId) {
    return { success: false, code: 'NO_POST_ID', message: '缺少帖子 ID' };
  }
  if (!isValidPhone(phone)) {
    return { success: false, code: 'INVALID_PHONE', message: '手机号格式不正确' };
  }

  let postRes;
  try {
    postRes = await db.collection('posts').doc(postId).get();
  } catch (error) {
    return { success: false, code: 'NOT_FOUND', message: '帖子不存在' };
  }

  const oldPost = postRes.data;
  if (oldPost._openid !== OPENID && oldPost.creator_openid !== OPENID) {
    return { success: false, code: 'NO_PERMISSION', message: '只能编辑自己发布的帖子' };
  }

  const category = resolveCategory(post.category, post.type);
  const type = resolveDisplayType(category, post.type, post.custom_type);
  const totalPeople = Number(post.total_people);
  if (!type || !post.date || !post.time || !post.location || !Number.isFinite(totalPeople) || totalPeople < 0 || !post.gender) {
    return { success: false, code: 'INVALID_POST', message: '发布信息不完整' };
  }

  if (!Number.isFinite(eventTimestamp)) {
    return { success: false, code: 'INVALID_TIME', message: '请选择有效的日期和时间' };
  }

  if (eventTimestamp < currentMinuteStart) {
    return { success: false, code: 'PAST_TIME', message: '不能保存已经过去的邀约时间' };
  }

  const joinedCount = Array.isArray(oldPost.joined_openids) ? oldPost.joined_openids.length : 0;
  await db.collection('posts').doc(postId).update({
    data: {
      ...buildPostUpdateData(post, eventTimestamp),
      initial_people: joinedCount + Math.max(totalPeople, 0)
    }
  });

  const contactRes = await db.collection('post_contacts')
    .where({ post_id: postId })
    .limit(1)
    .get();
  if (contactRes.data.length > 0) {
    await db.collection('post_contacts').doc(contactRes.data[0]._id).update({
      data: {
        phone,
        update_time: db.serverDate()
      }
    });
  } else {
    await db.collection('post_contacts').add({
      data: {
        _openid: OPENID,
        post_id: postId,
        phone,
        create_time: db.serverDate(),
        update_time: db.serverDate()
      }
    });
  }

  return { success: true, postId };
};

const submitFeedback = async event => {
  const { OPENID } = getWxContext();
  const feedback = event.feedback || {};
  const user = feedback.user || {};
  const content = normalizeText(feedback.content, 500);

  if (!OPENID) {
    return { success: false, code: 'NO_LOGIN', message: '请先登录' };
  }

  if (content.length < 5) {
    return { success: false, code: 'INVALID_FEEDBACK', message: '请多写一点问题细节' };
  }

  let addRes;
  try {
    addRes = await addFeedbackRecord({
      _openid: OPENID,
      category: normalizeText(feedback.category || '其他', 20),
      content,
      contact: normalizeText(feedback.contact, 80),
      page: normalizeText(feedback.page, 40),
      user_name: normalizeText(user.nickname, 40),
      user_gender: normalizeText(user.gender, 20),
      user_mbti: normalizeText(user.mbti, 10),
      user_tag: normalizeText(user.tag, 40),
      system_info: pickSystemInfo(feedback.system),
      status: 'open',
      create_time: db.serverDate(),
      update_time: db.serverDate()
    });
  } catch (err) {
    console.error('保存问题反馈失败:', err);
    return { success: false, code: 'SAVE_FEEDBACK_FAILED', message: '反馈保存失败，请稍后重试' };
  }

  return {
    success: true,
    feedbackId: addRes._id
  };
};

const getPosts = async () => {
  const nowTimestamp = Date.now();
  const { todayStart, tomorrowStart, dayAfterTomorrowStart } = getDisplayRange(nowTimestamp);

  await cleanupExpiredPosts();

  const res = await db.collection('posts')
    .orderBy('create_time', 'desc')
    .limit(LIST_FETCH_LIMIT)
    .get();

  const activePosts = await pruneExpiredPosts(res.data, nowTimestamp);
  const visiblePosts = sortPostsByEventTime(
    activePosts.filter(post => isWithinDisplayRange(post, nowTimestamp))
  );

  return {
    success: true,
    posts: visiblePosts,
    stats: {
      todayCount: visiblePosts.filter(post => post.event_timestamp >= todayStart && post.event_timestamp < tomorrowStart).length,
      tomorrowCount: visiblePosts.filter(post => post.event_timestamp >= tomorrowStart && post.event_timestamp < dayAfterTomorrowStart).length,
      futureCount: visiblePosts.filter(post => post.event_timestamp >= dayAfterTomorrowStart).length,
      openCount: visiblePosts.filter(post => post.status !== 'full' && Number(post.total_people) > 0).length
    }
  };
};

const saveJoinNotifyStatus = async event => {
  const { OPENID } = getWxContext();
  const templateId = normalizeText(event.templateId, 200);
  const enabled = !!event.enabled;

  if (!OPENID) {
    return { success: false, code: 'NO_LOGIN', message: '请先登录' };
  }
  if (!templateId) {
    return { success: false, code: 'NO_TEMPLATE_ID', message: '缺少订阅消息模板 ID' };
  }

  const data = {
    join_notify_enabled: enabled,
    join_notify_template_id: enabled ? templateId : '',
    join_notify_update_time: db.serverDate(),
    update_time: db.serverDate()
  };

  const userRes = await db.collection('users')
    .where({ _openid: OPENID })
    .limit(1)
    .get();

  if (userRes.data.length > 0) {
    await db.collection('users').doc(userRes.data[0]._id).update({ data });
  } else {
    await db.collection('users').add({
      data: {
        _openid: OPENID,
        ...data,
        create_time: db.serverDate()
      }
    });
  }

  return { success: true, enabled };
};

const saveChatNotifyStatus = async event => {
  const { OPENID } = getWxContext();
  const templateId = normalizeText(event.templateId, 200);
  const enabled = !!event.enabled;

  if (!OPENID) {
    return { success: false, code: 'NO_LOGIN', message: '请先登录' };
  }
  if (!templateId) {
    return { success: false, code: 'NO_TEMPLATE_ID', message: '缺少聊天订阅消息模板 ID' };
  }

  const data = {
    chat_notify_enabled: enabled,
    chat_notify_template_id: enabled ? templateId : '',
    chat_notify_update_time: db.serverDate(),
    update_time: db.serverDate()
  };

  const userRes = await db.collection('users')
    .where({ _openid: OPENID })
    .limit(1)
    .get();

  if (userRes.data.length > 0) {
    await db.collection('users').doc(userRes.data[0]._id).update({ data });
  } else {
    await db.collection('users').add({
      data: {
        _openid: OPENID,
        ...data,
        create_time: db.serverDate()
      }
    });
  }

  return { success: true, enabled };
};

const checkNickname = async event => {
  const { OPENID } = getWxContext();
  const nickname = normalizeText(event.nickname, 40);

  if (!OPENID) {
    return { success: false, code: 'NO_LOGIN', message: '请先登录' };
  }

  if (!nickname) {
    return { success: false, code: 'INVALID_NICKNAME', message: '请先设置昵称' };
  }

  const res = await db.collection('users')
    .where({ user_name: nickname })
    .limit(10)
    .get();
  const occupied = res.data.some(item => item._openid && item._openid !== OPENID);

  return {
    success: true,
    available: !occupied,
    message: occupied ? '这个昵称已被校友使用' : ''
  };
};

const getPostDetail = async event => {
  const { OPENID } = getWxContext();
  const postId = event.postId;
  const notifyConfig = event.joinNotifyConfig || {};
  const nowTimestamp = Date.now();

  if (!postId) {
    return { success: false, code: 'NO_POST_ID', message: '缺少帖子 ID' };
  }

  await cleanupExpiredPosts();

  let postRes;
  try {
    postRes = await db.collection('posts').doc(postId).get();
  } catch (error) {
    return { success: false, code: 'NOT_FOUND', message: '帖子不存在或已过期' };
  }

  const post = buildPostForClient(postRes.data, nowTimestamp);
  if (!Number.isFinite(post.event_timestamp) || isPostExpired(post, nowTimestamp)) {
    await removePostsByIds([postId]);
    return { success: false, code: 'EXPIRED', message: '帖子已过期' };
  }

  const canSeePhone = canSeeContact(post, OPENID);
  if (!canSeePhone) {
    delete post.phone;
  } else {
    const contactMap = await getContactMap([postId]);
    post.phone = contactMap[postId] || post.phone || '';
  }

  const creatorOpenid = post.creator_openid || post._openid || '';
  const creatorNotifyEnabled = await getJoinNotifyEnabled(creatorOpenid, notifyConfig.templateId);

  return {
    success: true,
    post,
    canSeePhone,
    isCreator: post._openid === OPENID || post.creator_openid === OPENID,
    isJoined: (post.joined_openids || []).includes(OPENID),
    creatorNotifyEnabled
  };
};

const joinPost = async event => {
  const { OPENID } = getWxContext();
  const postId = event.postId;
  const userProfile = event.userProfile || {};
  const nowTimestamp = Date.now();

  if (!OPENID) {
    return { success: false, code: 'NO_LOGIN', message: '请先登录' };
  }
  if (!postId) {
    return { success: false, code: 'NO_POST_ID', message: '缺少帖子 ID' };
  }

  await cleanupExpiredPosts();

  let postRes;
  try {
    postRes = await db.collection('posts').doc(postId).get();
  } catch (error) {
    return { success: false, code: 'NOT_FOUND', message: '帖子不存在或已过期' };
  }

  const post = buildPostForClient(postRes.data, nowTimestamp);
  const joinedOpenids = post.joined_openids || [];

  if (!Number.isFinite(post.event_timestamp) || isPostExpired(post, nowTimestamp)) {
    await removePostsByIds([postId]);
    return { success: false, code: 'EXPIRED', message: '这个搭子已经过期啦' };
  }

  if (post._openid === OPENID || post.creator_openid === OPENID) {
    return { success: false, code: 'OWN_POST', message: '这是你发布的搭子' };
  }

  if (joinedOpenids.includes(OPENID)) {
    const contactMap = await getContactMap([postId]);
    return {
      success: true,
      code: 'ALREADY_JOINED',
      message: '你已经上车了',
      phone: contactMap[postId] || post.phone || ''
    };
  }

  if (post.status === 'full' || Number(post.total_people) <= 0) {
    return { success: false, code: 'FULL', message: '这个搭子已经满员' };
  }

  const joinedUser = {
    openid: OPENID,
    nickname: normalizeText(userProfile.nickname || userProfile.user_name || '民大同学', 40),
    avatar: normalizeText(userProfile.avatar || userProfile.user_avatar || '', 300),
    gender: normalizeText(userProfile.gender || '', 20),
    answer_tags: normalizeStringArray(userProfile.answerTags || userProfile.answer_tags, 4, 16),
    join_time: db.serverDate()
  };

  const updateRes = await db.collection('posts')
    .where({
      _id: postId,
      total_people: _.gt(0),
      status: _.neq('full'),
      joined_openids: _.nin([OPENID])
    })
    .update({
      data: {
        total_people: _.inc(-1),
        joined_openids: _.push(OPENID),
        joined_users: _.push(joinedUser),
        update_time: db.serverDate()
      }
    });

  if (!updateRes.stats || updateRes.stats.updated === 0) {
    return { success: false, code: 'JOIN_FAILED', message: '名额状态已变化，请刷新后重试' };
  }

  const nextPostRes = await db.collection('posts').doc(postId).get();
  const nextPost = nextPostRes.data;
  const remain = Number(nextPost.total_people);

  if (remain <= 0 && nextPost.status !== 'full') {
    await db.collection('posts').doc(postId).update({
      data: {
        status: 'full',
        full_time: db.serverDate(),
        update_time: db.serverDate()
      }
    });
  }

  const notifyConfig = event.joinNotifyConfig || {};
  try {
    const creatorOpenid = nextPost.creator_openid || nextPost._openid;
    const creatorNotifyEnabled = await getJoinNotifyEnabled(
      creatorOpenid,
      notifyConfig.templateId
    );

    if (creatorNotifyEnabled) {
      await sendJoinNotify(
        {
          ...nextPost,
          status: remain <= 0 ? 'full' : nextPost.status
        },
        joinedUser,
        remain,
        notifyConfig
      );
      await consumeJoinNotifyStatus(creatorOpenid, notifyConfig.templateId);
    }
  } catch (notifyError) {
    console.warn('发送新人加入提醒失败：', notifyError);
  }

  const contactMap = await getContactMap([postId]);
  return {
    success: true,
    code: remain <= 0 ? 'FULL_AFTER_JOIN' : 'JOINED',
    message: remain <= 0 ? '上车成功，搭子已满员' : '上车成功',
    phone: contactMap[postId] || nextPost.phone || '',
    remain: Math.max(remain, 0)
  };
};

const cancelJoinPost = async event => {
  const { OPENID } = getWxContext();
  const postId = event.postId;
  const nowTimestamp = Date.now();

  if (!OPENID) {
    return { success: false, code: 'NO_LOGIN', message: '请先登录' };
  }
  if (!postId) {
    return { success: false, code: 'NO_POST_ID', message: '缺少帖子 ID' };
  }

  await cleanupExpiredPosts();

  let postRes;
  try {
    postRes = await db.collection('posts').doc(postId).get();
  } catch (error) {
    return { success: false, code: 'NOT_FOUND', message: '帖子不存在或已过期' };
  }

  const post = buildPostForClient(postRes.data, nowTimestamp);
  if (!Number.isFinite(post.event_timestamp) || isPostExpired(post, nowTimestamp)) {
    await removePostsByIds([postId]);
    return { success: false, code: 'EXPIRED', message: '这个搭子已经过期啦' };
  }

  if (post._openid === OPENID || post.creator_openid === OPENID) {
    return { success: false, code: 'OWN_POST', message: '发起人不能退出自己的搭子' };
  }

  const joinedOpenids = Array.isArray(post.joined_openids) ? post.joined_openids : [];
  if (!joinedOpenids.includes(OPENID)) {
    return { success: false, code: 'NOT_JOINED', message: '你还没有加入这个搭子' };
  }

  const nextJoinedOpenids = joinedOpenids.filter(openid => openid !== OPENID);
  const nextJoinedUsers = Array.isArray(post.joined_users)
    ? post.joined_users.filter(user => user.openid !== OPENID)
    : [];
  const nextRemain = Math.max(Number(post.total_people || 0) + 1, 1);

  await db.collection('posts').doc(postId).update({
    data: {
      joined_openids: nextJoinedOpenids,
      joined_users: nextJoinedUsers,
      total_people: nextRemain,
      status: 'open',
      update_time: db.serverDate()
    }
  });

  return {
    success: true,
    message: '已退出搭子',
    remain: nextRemain
  };
};

const getMyPosts = async () => {
  const { OPENID } = getWxContext();
  const nowTimestamp = Date.now();

  if (!OPENID) {
    return { success: false, code: 'NO_LOGIN', message: '请先登录' };
  }

  await cleanupExpiredPosts();

  const [publishedRes, joinedRes] = await Promise.all([
    db.collection('posts')
      .where({ _openid: OPENID })
      .orderBy('create_time', 'desc')
      .limit(LIST_FETCH_LIMIT)
      .get(),
    db.collection('posts')
      .where({ joined_openids: OPENID })
      .orderBy('create_time', 'desc')
      .limit(LIST_FETCH_LIMIT)
      .get()
  ]);

  const [publishedPosts, joinedPosts] = await Promise.all([
    pruneExpiredPosts(publishedRes.data, nowTimestamp),
    pruneExpiredPosts(joinedRes.data, nowTimestamp)
  ]);

  const visiblePublishedPosts = sortPostsByEventTime(
    publishedPosts.filter(post => isWithinDisplayRange(post, nowTimestamp))
  );
  const visibleJoinedPosts = sortPostsByEventTime(
    joinedPosts.filter(post => isWithinDisplayRange(post, nowTimestamp))
  );

  const postIds = [
    ...visiblePublishedPosts.map(item => item._id),
    ...visibleJoinedPosts.map(item => item._id)
  ];
  const contactMap = await getContactMap(postIds);

  const attachPhone = item => ({
    ...item,
    phone: contactMap[item._id] || item.phone || ''
  });

  return {
    success: true,
    publishedPosts: visiblePublishedPosts.map(attachPhone),
    joinedPosts: visibleJoinedPosts.map(attachPhone)
  };
};

const getNotifications = async () => {
  const { OPENID } = getWxContext();
  if (!OPENID) {
    return { success: false, code: 'NO_LOGIN', message: '请先登录' };
  }

  const res = await safeCollectionGet('notifications', collection => collection
    .where({ recipient_openid: OPENID })
    .limit(100));
  const notifications = res.data
    .sort((left, right) => Number(right.create_ts || 0) - Number(left.create_ts || 0))
    .map(item => ({
      ...item,
      timeText: formatChinaDateTimeText(Number(item.create_ts || Date.now()))
    }));

  return {
    success: true,
    notifications,
    unreadCount: notifications.filter(item => !item.read).length
  };
};

const markNotificationsRead = async event => {
  const { OPENID } = getWxContext();
  const ids = normalizeStringArray(event.ids, 50, 80);

  if (!OPENID) {
    return { success: false, code: 'NO_LOGIN', message: '请先登录' };
  }
  if (!ids.length) {
    return { success: true };
  }

  await Promise.all(ids.map(id => db.collection('notifications')
    .where({
      _id: id,
      recipient_openid: OPENID
    })
    .update({
      data: {
        read: true,
        read_time: db.serverDate()
      }
    }).catch(() => null)));

  return { success: true };
};

const buildConversationForClient = (conversation, openid) => {
  const isCreator = conversation.creator_openid === openid;
  return {
    ...conversation,
    peer_openid: isCreator ? conversation.joiner_openid : conversation.creator_openid,
    peer_name: isCreator ? conversation.joiner_name : conversation.creator_name,
    peer_avatar: isCreator ? conversation.joiner_avatar : conversation.creator_avatar,
    my_role: isCreator ? 'creator' : 'joiner'
  };
};

const getOrCreateChat = async event => {
  const { OPENID } = getWxContext();
  const postId = normalizeText(event.postId, 80);
  const peerOpenid = normalizeText(event.peerOpenid, 64);
  const nowTimestamp = Date.now();

  if (!OPENID) {
    return { success: false, code: 'NO_LOGIN', message: '请先登录' };
  }
  if (!postId) {
    return { success: false, code: 'NO_POST_ID', message: '缺少帖子 ID' };
  }

  let postRes;
  try {
    postRes = await db.collection('posts').doc(postId).get();
  } catch (error) {
    return { success: false, code: 'NOT_FOUND', message: '帖子不存在或已被删除' };
  }

  const post = buildPostForClient(postRes.data, nowTimestamp);
  const creatorOpenid = normalizeText(post.creator_openid || post._openid, 64);
  const joinedOpenids = Array.isArray(post.joined_openids) ? post.joined_openids : [];
  const joinedUsers = Array.isArray(post.joined_users) ? post.joined_users : [];
  const currentIsCreator = OPENID === creatorOpenid || OPENID === post._openid;
  const currentIsJoined = joinedOpenids.includes(OPENID);

  let joinerOpenid = '';
  if (currentIsCreator) {
    joinerOpenid = peerOpenid;
    if (!joinerOpenid || !joinedOpenids.includes(joinerOpenid)) {
      return { success: false, code: 'INVALID_PEER', message: '只能和已加入的同学聊天' };
    }
  } else if (currentIsJoined) {
    joinerOpenid = OPENID;
  } else {
    return { success: false, code: 'NO_PERMISSION', message: '加入后才能聊天' };
  }

  const joinedUser = joinedUsers.find(user => user.openid === joinerOpenid) || {};
  const conversationKey = `${postId}_${creatorOpenid}_${joinerOpenid}`;
  const existingRes = await safeCollectionGet('chat_conversations', collection => collection
    .where({ conversation_key: conversationKey })
    .limit(1));

  if (existingRes.data.length) {
    return {
      success: true,
      conversation: buildConversationForClient(existingRes.data[0], OPENID)
    };
  }

  const conversationData = {
    conversation_key: conversationKey,
    post_id: postId,
    post_title: normalizeText(post.type || '校园邀约', 40),
    post_deleted: false,
    participant_openids: [creatorOpenid, joinerOpenid],
    creator_openid: creatorOpenid,
    creator_name: normalizeText(post.creator_name || '发起人', 40),
    creator_avatar: normalizeText(post.creator_avatar || '', 300),
    joiner_openid: joinerOpenid,
    joiner_name: normalizeText(joinedUser.nickname || '已加入同学', 40),
    joiner_avatar: normalizeText(joinedUser.avatar || '', 300),
    last_message: '',
    update_ts: Date.now(),
    create_ts: Date.now(),
    create_time: db.serverDate(),
    update_time: db.serverDate()
  };

  const addRes = await addCollectionRecord('chat_conversations', conversationData);
  return {
    success: true,
    conversation: buildConversationForClient({
      ...conversationData,
      _id: addRes._id
    }, OPENID)
  };
};

const getChatMessages = async event => {
  const { OPENID } = getWxContext();
  const conversationId = normalizeText(event.conversationId, 80);

  if (!OPENID) {
    return { success: false, code: 'NO_LOGIN', message: '请先登录' };
  }
  if (!conversationId) {
    return { success: false, code: 'NO_CONVERSATION_ID', message: '缺少聊天 ID' };
  }

  let conversationRes;
  try {
    conversationRes = await db.collection('chat_conversations').doc(conversationId).get();
  } catch (error) {
    return { success: false, code: 'NOT_FOUND', message: '聊天不存在' };
  }

  const conversation = conversationRes.data;
  if (!Array.isArray(conversation.participant_openids) || !conversation.participant_openids.includes(OPENID)) {
    return { success: false, code: 'NO_PERMISSION', message: '无权查看该聊天' };
  }

  const messageRes = await safeCollectionGet('chat_messages', collection => collection
    .where({ conversation_id: conversationId })
    .limit(100));

  return {
    success: true,
    conversation: buildConversationForClient(conversation, OPENID),
    messages: messageRes.data
      .sort((left, right) => Number(left.create_ts || 0) - Number(right.create_ts || 0))
      .map(item => ({
        ...item,
        sender_display_name: item.sender_openid === conversation.creator_openid
          ? normalizeText(conversation.creator_name || item.sender_name || '发起人', 40)
          : normalizeText(conversation.joiner_name || item.sender_name || '已加入同学', 40),
        sender_avatar: item.sender_openid === conversation.creator_openid
          ? normalizeText(conversation.creator_avatar || item.sender_avatar || '', 300)
          : normalizeText(conversation.joiner_avatar || item.sender_avatar || '', 300),
        isMine: item.sender_openid === OPENID,
        timeText: formatChinaDateTimeText(Number(item.create_ts || Date.now()))
      }))
  };
};

const sendChatMessage = async event => {
  const { OPENID } = getWxContext();
  const conversationId = normalizeText(event.conversationId, 80);
  const content = normalizeText(event.content, 500);
  const notifyConfig = event.chatNotifyConfig || {};

  if (!OPENID) {
    return { success: false, code: 'NO_LOGIN', message: '请先登录' };
  }
  if (!conversationId) {
    return { success: false, code: 'NO_CONVERSATION_ID', message: '缺少聊天 ID' };
  }
  if (!content) {
    return { success: false, code: 'EMPTY_MESSAGE', message: '请输入聊天内容' };
  }

  let conversationRes;
  try {
    conversationRes = await db.collection('chat_conversations').doc(conversationId).get();
  } catch (error) {
    return { success: false, code: 'NOT_FOUND', message: '聊天不存在' };
  }

  const conversation = conversationRes.data;
  const participants = Array.isArray(conversation.participant_openids) ? conversation.participant_openids : [];
  if (!participants.includes(OPENID)) {
    return { success: false, code: 'NO_PERMISSION', message: '无权发送消息' };
  }

  const isCreator = OPENID === conversation.creator_openid;
  const receiverOpenid = participants.find(openid => openid !== OPENID) || '';
  const senderName = isCreator ? conversation.creator_name : conversation.joiner_name;
  const senderAvatar = isCreator ? conversation.creator_avatar : conversation.joiner_avatar;
  const nowTs = Date.now();
  const messageData = {
    conversation_id: conversationId,
    post_id: conversation.post_id,
    sender_openid: OPENID,
    sender_name: normalizeText(senderName || '民大同学', 40),
    sender_avatar: normalizeText(senderAvatar || '', 300),
    content,
    create_ts: nowTs,
    create_time: db.serverDate()
  };

  const addRes = await addCollectionRecord('chat_messages', messageData);
  await db.collection('chat_conversations').doc(conversationId).update({
    data: {
      last_message: content,
      update_ts: nowTs,
      update_time: db.serverDate()
    }
  });

  if (receiverOpenid) {
    await addUserNotification({
      recipient_openid: receiverOpenid,
      sender_openid: OPENID,
      type: 'chat_message',
      title: `${messageData.sender_name} 发来新消息`,
      content: normalizeText(content, 80),
      conversation_id: conversationId,
      related_post_id: conversation.post_id,
      post_title: conversation.post_title
    }).catch(err => {
      console.warn('保存聊天消息通知失败:', err);
    });

    try {
      const receiverNotifyEnabled = await getChatNotifyEnabled(receiverOpenid, notifyConfig.templateId);
      if (receiverNotifyEnabled) {
        await sendChatNotify(
          {
            ...conversation,
            _id: conversationId
          },
          messageData,
          receiverOpenid,
          notifyConfig
        );
        await consumeChatNotifyStatus(receiverOpenid, notifyConfig.templateId);
      }
    } catch (notifyError) {
      console.warn('发送聊天订阅提醒失败:', notifyError);
    }
  }

  return {
    success: true,
    message: {
      ...messageData,
      _id: addRes._id,
      sender_display_name: messageData.sender_name,
      isMine: true,
      timeText: formatChinaDateTimeText(nowTs)
    }
  };
};

const deletePost = async event => {
  const { OPENID } = getWxContext();
  const postId = event.postId;

  if (!OPENID) {
    return { success: false, code: 'NO_LOGIN', message: '请先登录' };
  }
  if (!postId) {
    return { success: false, code: 'NO_POST_ID', message: '缺少帖子 ID' };
  }

  let postRes;
  try {
    postRes = await db.collection('posts').doc(postId).get();
  } catch (error) {
    return { success: false, code: 'NOT_FOUND', message: '帖子不存在' };
  }

  const post = postRes.data;
  if (post._openid !== OPENID && post.creator_openid !== OPENID) {
    return { success: false, code: 'NO_PERMISSION', message: '只能删除自己发布的帖子' };
  }

  const clientPost = buildPostForClient(post, Date.now());
  const joinedOpenids = Array.isArray(post.joined_openids) ? post.joined_openids : [];
  const joinedCount = [...new Set(joinedOpenids.filter(Boolean))].length;
  let notifiedCount = 0;
  let penalty = null;

  if (joinedCount > 0) {
    notifiedCount = await notifyJoinedUsersPostDeleted(clientPost, joinedOpenids, OPENID);
    penalty = await createDeletePenalty(OPENID, clientPost, joinedCount);
    await markPostConversationsDeleted(clientPost);
  }

  await removePostsByIds([postId]);
  return {
    success: true,
    joinedCount,
    notifiedCount,
    penalty
  };
};

exports.main = async event => {
  switch (event.type) {
    case 'getOpenId':
      return await getOpenId();
    case 'getMiniProgramCode':
      return await getMiniProgramCode();
    case 'createPost':
      return await createPost(event);
    case 'submitFeedback':
      return await submitFeedback(event);
    case 'getPosts':
      return await getPosts();
    case 'saveJoinNotifyStatus':
      return await saveJoinNotifyStatus(event);
    case 'saveChatNotifyStatus':
      return await saveChatNotifyStatus(event);
    case 'checkNickname':
      return await checkNickname(event);
    case 'getPostDetail':
      return await getPostDetail(event);
    case 'joinPost':
      return await joinPost(event);
    case 'cancelJoinPost':
      return await cancelJoinPost(event);
    case 'getMyPosts':
      return await getMyPosts();
    case 'updatePost':
      return await updatePost(event);
    case 'deletePost':
      return await deletePost(event);
    case 'getNotifications':
      return await getNotifications();
    case 'markNotificationsRead':
      return await markNotificationsRead(event);
    case 'getOrCreateChat':
      return await getOrCreateChat(event);
    case 'getChatMessages':
      return await getChatMessages(event);
    case 'sendChatMessage':
      return await sendChatMessage(event);
    default:
      return {
        success: false,
        code: 'UNKNOWN_TYPE',
        message: '未知云函数类型'
      };
  }
};
