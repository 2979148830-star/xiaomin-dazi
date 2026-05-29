const TIME_GROUP_CONFIGS = [
  { key: 'today', label: '今天', hint: '适合马上约' },
  { key: 'tomorrow', label: '明天', hint: '适合提前约' },
  { key: 'future', label: '以后', hint: '适合先占位' }
];

const TIME_FILTER_CONFIGS = [
  { key: 'all', label: '全部', hint: '都能看' },
  ...TIME_GROUP_CONFIGS
];

const matchTimeGroup = (post, timeKey) => {
  if (timeKey === 'today') return post.day_label === '今天';
  if (timeKey === 'tomorrow') return post.day_label === '明天';
  if (timeKey === 'future') return post.day_label === '以后';
  return true;
};

const filterPostsByTime = (postList = [], timeKey = 'all') => {
  if (timeKey === 'all') {
    return postList;
  }

  return postList.filter(post => matchTimeGroup(post, timeKey));
};

const splitHobbies = hobbies => {
  return String(hobbies || '')
    .split(/[、,，/｜|\s]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 4);
};

Page({
  data: {
    postList: [],
    filteredPostList: [],
    groupedPostSections: [],
    currentTimeFilter: 'all',
    currentTab: '全部',
    totalFilteredCount: 0,
    openFilteredCount: 0,
    loadingPosts: false,
    loadError: false,
    loadErrorText: '帖子加载失败，请检查网络后再试。',
    emptyStateText: '广场暂时还没有邀约，去成为第一个吧。',
    timeFilterTabs: TIME_FILTER_CONFIGS.map(item => ({ ...item, count: 0 })),
    stats: {
      todayCount: 0,
      tomorrowCount: 0,
      futureCount: 0,
      openCount: 0
    },
    tabs: ['全部', '散步', '聊天', '游戏', '桌游', '旅游', '拼单', '学习', '干饭', '运动', '其他']
  },

  onShow() {
    this.getPostsData();
  },

  getPostsData() {
    this.setData({
      loadingPosts: true,
      loadError: false,
      loadErrorText: '帖子加载失败，请检查网络后再试。'
    });

    wx.cloud.callFunction({
      name: 'quickstartFunctions',
      data: { type: 'getPosts' },
      success: res => {
        if (!res.result || !res.result.success) {
          this.setData({
            loadError: true,
            loadErrorText: (res.result && res.result.message) || '帖子加载失败，请稍后重试。'
          });
          return;
        }

        const processedPosts = (res.result.posts || []).map(rawPost => {
          const post = { ...rawPost };
          delete post.phone;

          const isFull = post.status === 'full' || Number(post.total_people) <= 0;
          const answerTags = Array.isArray(post.creator_answer_tags)
            ? post.creator_answer_tags
            : [];

          post.statusText = isFull ? '已满员' : '招募中';
          post.statusClass = isFull ? 'full' : 'open';
          post.remainText = isFull ? '名额已满' : `还缺 ${post.total_people || 0} 人`;
          post.creatorHobbyTags = splitHobbies(post.creator_hobbies);
          post.answerTagsPreview = answerTags.slice(0, 4);
          post.answerTagsOverflowCount = Math.max(answerTags.length - post.answerTagsPreview.length, 0);

          return post;
        });

        this.setData({
          postList: processedPosts,
          stats: res.result.stats || this.data.stats,
          loadError: false
        }, () => {
          this.applyFilters();
        });
      },
      fail: err => {
        console.error('帖子加载失败：', err);
        this.setData({
          loadError: true,
          loadErrorText: '网络连接失败，请稍后重试。'
        });
      },
      complete: () => {
        this.setData({ loadingPosts: false });
        wx.stopPullDownRefresh();
      }
    });
  },

  buildTimeFilterTabs(postList = []) {
    const counts = {
      all: postList.length,
      today: postList.filter(post => matchTimeGroup(post, 'today')).length,
      tomorrow: postList.filter(post => matchTimeGroup(post, 'tomorrow')).length,
      future: postList.filter(post => matchTimeGroup(post, 'future')).length
    };

    return TIME_FILTER_CONFIGS.map(item => ({
      ...item,
      count: counts[item.key] || 0
    }));
  },

  buildGroupedPostSections(postList = [], timeFilter = 'all') {
    const targetConfigs = timeFilter === 'all'
      ? TIME_GROUP_CONFIGS
      : TIME_GROUP_CONFIGS.filter(item => item.key === timeFilter);

    return targetConfigs
      .map(config => {
        const posts = filterPostsByTime(postList, config.key);

        return {
          ...config,
          posts,
          count: posts.length
        };
      })
      .filter(section => section.count > 0);
  },

  buildEmptyStateText(tab = '全部', timeFilter = 'all') {
    const timeLabel = TIME_FILTER_CONFIGS.find(item => item.key === timeFilter)?.label || '';
    const filters = [];

    if (timeFilter !== 'all' && timeLabel) {
      filters.push(timeLabel);
    }
    if (tab !== '全部') {
      filters.push(tab);
    }

    if (!filters.length) {
      return '广场暂时还没有邀约，去成为第一个吧。';
    }

    return `${filters.join(' · ')} 暂时还没人发车，去成为第一个吧。`;
  },

  applyFilters({
    tab = this.data.currentTab,
    timeFilter = this.data.currentTimeFilter
  } = {}) {
    const categoryFilteredList = tab === '全部'
      ? this.data.postList
      : this.data.postList.filter(item => item.category === tab);
    const filteredPostList = filterPostsByTime(categoryFilteredList, timeFilter);
    const groupedPostSections = this.buildGroupedPostSections(categoryFilteredList, timeFilter);
    const openFilteredCount = filteredPostList.filter(
      item => item.status !== 'full' && Number(item.total_people) > 0
    ).length;

    this.setData({
      currentTab: tab,
      currentTimeFilter: timeFilter,
      filteredPostList,
      groupedPostSections,
      totalFilteredCount: filteredPostList.length,
      openFilteredCount,
      emptyStateText: this.buildEmptyStateText(tab, timeFilter),
      timeFilterTabs: this.buildTimeFilterTabs(categoryFilteredList)
    });
  },

  switchTab(e) {
    this.applyFilters({
      tab: e.currentTarget.dataset.tab
    });
  },

  switchTimeFilter(e) {
    this.applyFilters({
      timeFilter: e.currentTarget.dataset.timeKey
    });
  },

  goToDetail(e) {
    const postId = e.currentTarget.dataset.id;
    if (!postId) return;
    wx.navigateTo({
      url: `/pkg-extra/detail/detail?id=${postId}`
    });
  },

  retryLoad() {
    this.getPostsData();
  },

  onPullDownRefresh() {
    this.getPostsData();
  }
});
