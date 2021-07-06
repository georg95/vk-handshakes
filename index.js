vkBridge.send('VKWebAppInit', {}).then(function() {
function noUndef(obj) {
  var copy = Object.assign({}, obj)
  for (var key in copy) {
    if (copy[key] === undefined) {
      delete copy[key]
    }
  }
  return copy
}
function addFriendsTier(db, ids, userId) {
  ids.forEach(id => {
    if (db[id] === undefined) {
      db[id] = userId
    }
  })
}
function getChainFrom(db, fromId, toId) {
  if (fromId === toId) { return [] }
  return [Number(db[fromId])].concat(getChainFrom(db, db[fromId], toId))
}
function getCommonFriends(db1, db2, fromId, toId) {
  if (fromId === toId) return []
  for (var idString in db1) {
    var id = Number(idString)
    if (db2[id]) {
      return getChainFrom(db1, id, fromId).reverse()
        .concat(id)
        .concat(getChainFrom(db2, id, toId))
    }
  }
  return null
}

// console.log(getCommonFriends({
//   555: 123,
//   666: 123,
//   333: 555,
// }, {
//   333: 1111,
//   4444: 1111
// }, 123, 1111))

// -> [123, 555, 333, 1111]

var runButton = document.getElementById('run');
runButton.addEventListener('click', run);

async function sleep(ms) { return new Promise(res => setTimeout(res, ms)) }
async function getVkToken() {
  return vkBridge.send("VKWebAppGetAuthToken", {"app_id": 7896965, "scope": "friends,status"});
}

function checkStop() {
  if (stop) {
    throw new Error('stop')
  }
}

async function getUsersData(access_token, user_ids) {
  checkStop();
  await sleep(500)
  return vkBridge.send("VKWebAppCallAPIMethod", {
    "method": "users.get",
    "request_id": "32test",
    "params": noUndef({"v":"5.131", access_token, user_ids, fields: 'photo_100'})
  }).then(({ response }) => response)
}

async function getFriends(access_token, user_id, wait=500) {
  checkStop();
  await sleep(wait)
  return vkBridge.send("VKWebAppCallAPIMethod", {
    "method": "friends.get",
    "request_id": "32test",
    "params": noUndef({"v":"5.131", access_token, user_id})
  }).then(({ response }) => response.items)
  .catch(e => {
    var errData = e.error_data || {}
    var errCode = (errData.error_reason || errData).error_code
    if (errCode === 18 || errCode === 30) {
      return [];
    }
    throw e
  })
}

function userName(user) {
  return `${user.first_name} ${user.last_name}`
}

function escapeHtml(unsafe) {
  return unsafe
       .replace(/&/g, "&amp;")
       .replace(/</g, "&lt;")
       .replace(/>/g, "&gt;")
       .replace(/"/g, "&quot;")
       .replace(/'/g, "&#039;");
}

function userLayout(user, progressId='defaultprogress') {
  return `
  <a class="profile" href="https://vk.com/id${user.id}" target="_blank">
    <img src="${user.photo_100}" alt="${escapeHtml(userName(user))}"/>
    <span>${escapeHtml(userName(user))}</span>
    <span class="progress" id="${progressId}"></span>
  </a>
  `;
}

function setLoaderLayout(user1, user2) {
  document.getElementById('search').innerHTML = `
  ${userLayout(user1, 'progress')}
  <div class="lds-ellipsis"><div></div><div></div><div></div><div></div></div>
  ${userLayout(user2, 'progress2')}
  `;
}

function friendsLayout() {
  return `<div class="friends">🤝</div>`;
}

function setUsersChainLayout(users) {
  document.getElementById('search').innerHTML = users.map(userLayout).join(friendsLayout());
}

var access_token;
var userInfo;
var running = false;
var stop = false;
var ownFriendsLoaded = false;
var friends1 = {}

async function init() {
  ({ access_token } = await getVkToken());
  userInfo = (await getUsersData(access_token))[0]
}

init()

async function run() {
  if (running) {
    stop = true;
    return;
  }
  running = true;
  runButton.innerText = 'Остановить'
  try {
    await search();
  } catch(e) {
    document.getElementById('search').innerHTML = '';
    if (!stop) {
      document.body.innerHTML += `<div class="error">${e.stack}<br />${JSON.stringify(e)}</div>`;
      console.error(e);
    }
  }
  runButton.innerText = 'Найти рукопожатия'
  running = false;
  stop = false;
}

async function search() {
  var screenName = document.getElementById('user').value;
  if (screenName.includes('vk.com')) {
    screenName = screenName.replace(/\/^/, '').split('/').reverse()[0];
  }
  const otherUserInfo = (await getUsersData(access_token, screenName, 0))[0]

  console.log('userInfo:', userInfo, otherUserInfo)
  setLoaderLayout(userInfo, otherUserInfo)

  var id1 = userInfo.id
  var id2 = otherUserInfo.id
  
  if (!ownFriendsLoaded) {
    addFriendsTier(friends1, await getFriends(access_token, id1), id1)
  }

  var friends2 = {}
  addFriendsTier(friends2, await getFriends(access_token, id2), id2)

  async function loadNextTierFrirend(friends, progressId) {
    var i = 0;
    var ids = Object.keys(friends)
    for (var idString of ids) {
      i++;
      var id = Number(idString)
      var nextTierFriends = await getFriends(access_token, id)
      console.log('add', nextTierFriends.length, 'friends')
      addFriendsTier(friends, nextTierFriends, id)
      if (document.querySelector(progressId)) {
        document.getElementById(progressId).innerText = `${i}/${ids.length}`
      }
      var commonFriends = getCommonFriends(friends1, friends2, id1, id2)
      if (commonFriends) {
        console.log('found:', commonFriends)
        var users = await getUsersData(access_token, commonFriends.join(','))
        console.log('users:', users)
        setUsersChainLayout(users);
        break
      }
    }
  }
  if (!ownFriendsLoaded) {
    await loadNextTierFrirend(friends1, '#progress')
  }
  ownFriendsLoaded = true
  await loadNextTierFrirend(friends2, '#progress2')
  document.getElementById('search').innerHTML = "Цепочка не найдена ("
}
});