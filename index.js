vkBridge.subscribe(({ detail: { type, data } }) => {
  if (type === 'VKWebAppUpdateConfig') {
    document.body.classList.add(data.appearance)
  }
});
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
  const chains = []
  if (fromId === toId) return []
  for (var idString in db1) {
    var id = Number(idString)
    if (db2[id]) {
      chains .push(getChainFrom(db1, id, fromId).reverse()
        .concat(id)
        .concat(getChainFrom(db2, id, toId)))
    }
  }
  return chains
}

// console.log(getCommonFriends({
//   555: 123,
//   666: 123,
//   333: 555,
// }, {
//   333: 1111,
//   4444: 1111
// }, 123, 1111))

// -> [[123, 555, 333, 1111]]

var runButton = document.getElementById('run')
runButton.addEventListener('click', run)
var destinationLink = document.getElementById('destination_link')
destinationLink.addEventListener('click', editDestination)

function editDestination() {
  var destination = document.createElement('input')
  destination.id = 'destination_user'
  document.body.replaceChild(destination, destinationLink)
}

async function sleep(ms) { return new Promise(res => setTimeout(res, ms)) }
async function getVkToken() {
  return vkBridge.send("VKWebAppGetAuthToken", {"app_id": 7896965, "scope": "friends,status"})
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

function getShorterChains(chains) {
  const minLen = Math.min.apply(Math, chains.map(chain => chain.length))
  return chains.filter(chain => chain.length === minLen)
}

function uniqueChains(chains) {
  const chainsStr = chains.map(chain => chain.join(','))
  return Array.from(new Set(chainsStr))
    .map(chainStr => chainStr.split(',')
    .map(idStr => Number(idStr)))
}

async function getChainsInfo(access_token, chains) {
  chains = uniqueChains(getShorterChains(chains)).slice(0, 20)
  let userIds = []
  chains.forEach(chain => userIds = userIds.concat(chain))
  userIds = Array.from(new Set(userIds))
  const users = await getUsersData(access_token, userIds.join(','))
  const userById = {}
  users.forEach(user => {
    userById[user.id] = user
  })
  return chains.map(chain => chain.map(id => userById[id]))
}

function friendBatchMicrocode(user_ids) {
  return `
var users = ${JSON.stringify(user_ids)};
var ids = [];
while (users.length > 0) {
  var friends = API.friends.get({"user_id": users.shift()});
  ids.push(friends.items);
}
return ids;
`
}

async function getFriendsBatch(access_token, user_ids, progressId) {
  var ids = []
  var lastIds = user_ids
  while (lastIds.length > 0) {
    var curIds = lastIds.slice(0, 25)
    lastIds = lastIds.slice(25)
    if (document.querySelector(progressId)) {
      document.querySelector(progressId).innerText = `${user_ids.length - lastIds.length}/${user_ids.length}`
    }
    checkStop()
    await sleep(500)
    var friends = await vkBridge.send("VKWebAppCallAPIMethod", {
      "method": "execute",
      "request_id": "32test",
      "params": noUndef({"v":"5.131", access_token, code: friendBatchMicrocode(curIds)})
    }).then(({ response }) => response)
    ids = ids.concat(friends)
  }
  return ids
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

function userLayout(user, progressId) {
  return `
  <a class="profile" href="https://vk.com/id${user.id}" target="_blank">
    <img src="${user.photo_100}" alt="${escapeHtml(userName(user))}"/>
    <span>${escapeHtml(userName(user))}</span>
    <span class="progress" id="${progressId}">${progressId ? '0/0' : ''}</span>
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
  return `<div class="friends">🤝</div>`
}

function getUsersChainLayout(users) {
  return '<div class="search-result">' + users.map(user => userLayout(user)).join(friendsLayout()) + '</div>'
}

var access_token;
var userInfo;
var running = false;
var stop = false;
var ownFriendsLoaded = false;

async function init() {
  ({ access_token } = await getVkToken());
  userInfo = (await getUsersData(access_token))[0]
}

init()

function resetState() {
  console.log('reset state');
  document.getElementById('run').innerText = 'Найти рукопожатия'
  running = false;
  stop = false;
}

async function run() {
  if (running) {
    stop = true;
    return;
  }
  running = true;
  document.body.querySelector('#error').innerText = '';
  runButton.innerText = 'Остановить'
  try {
    await search();
  } catch(e) {
    document.getElementById('search').innerHTML = '';
    if (!stop) {
      document.body.querySelector('#error').innerText += `${e.stack} ${JSON.stringify(e)}`;
      console.log(e)
    }
  }
  resetState()
}

function getScreenName(link) {
  if (link.includes('vk.com')) {
    return link.replace(/\/^/, '').split('/').reverse()[0];
  }

  return link
}

async function search() {
  var screenName = getScreenName(document.getElementById('user').value)
  var destUserField = document.getElementById('destination_user')
  if (destUserField && destUserField.value) {
    userInfo = (await getUsersData(access_token, getScreenName(destUserField.value), 0))[0]
  }
  const otherUserInfo = (await getUsersData(access_token, screenName, 0))[0]

  console.log('userInfo:', userInfo, otherUserInfo)
  setLoaderLayout(userInfo, otherUserInfo)

  var id1 = userInfo.id
  var id2 = otherUserInfo.id

  var friends1 = {}
  
  if (!ownFriendsLoaded) {
    addFriendsTier(friends1, await getFriends(access_token, id1), id1)
  } else {
    friends1 = ownFriendsLoaded;
  }

  var friends2 = {}
  addFriendsTier(friends2, await getFriends(access_token, id2), id2)

  async function loadNextTierFriend(friends, progressId) {
    var i = 0;
    var ids = Object.keys(friends).map(id => Number(id))
    var nextTierFriends = await getFriendsBatch(access_token, ids, progressId)
    for (var i = 0 ; i < ids.length; i++) {
      if (nextTierFriends[i]) {
        addFriendsTier(friends, nextTierFriends[i], ids[i])
      }
    }
  }
  if (!ownFriendsLoaded) {
    await loadNextTierFriend(friends1, '#progress')
  }
  ownFriendsLoaded = friends1
  await loadNextTierFriend(friends2, '#progress2')
  var idChains = getCommonFriends(friends1, friends2, id1, id2)
  if (idChains.length > 0) {
    console.log('found:', idChains)
    var userChains = await getChainsInfo(access_token, idChains)
    console.log('users:', userChains)
    document.getElementById('search').innerHTML = 
      '<div id="search-results">' + userChains.map(getUsersChainLayout).join('\n') + '</div>'
    return true
  }
  document.getElementById('search').innerHTML = "Цепочка не найдена ("
}
});