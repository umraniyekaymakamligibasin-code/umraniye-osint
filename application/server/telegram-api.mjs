export async function apiJSON(url,_secret,{send=fetch,method='GET',body}={}){
 const u=new URL(url);if(u.origin!=='https://api.telegram.org'||u.username||u.password||!/^\/bot\d{5,}:[A-Za-z0-9_-]{20,}\/(getMe|sendMessage|getChat|getChatMember)$/.test(u.pathname))throw Error('api_origin_invalid');
 let r;try{r=await send(u.href,{method,redirect:'error',...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)})}catch{throw Error('connection_failed')}
 if(!r.ok)throw Error(r.status===429?'rate_limited':[400,401,403].includes(r.status)?'permission_or_token':'api_unavailable');
 const reader=r.body.getReader(),parts=[];let length=0;try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>200000){await reader.cancel();throw Error('response_too_large')}parts.push(value)}}finally{reader.releaseLock()}
 let data;try{data=JSON.parse(Buffer.concat(parts).toString('utf8'))}catch{throw Error('invalid_response')}if(data.ok!==true)throw Error('permission_or_token');return data;
}
export async function checkAccount(a,{send=fetch}={}){if(a.provider!=='telegram')throw Error('provider_invalid');const d=await apiJSON('https://api.telegram.org/bot'+a.secret+'/getMe','',{send});if(!d.result?.is_bot)throw Error('permission_or_token');return 'bot_verified';}
export async function verifyTelegram(a,{send=fetch}={}){
 if(a.provider!=='telegram')throw Error('provider_invalid');const root='https://api.telegram.org/bot'+a.secret+'/';
 const bot=(await apiJSON(root+'getMe','',{send})).result;if(!bot?.is_bot||!bot.id)throw Error('permission_or_token');
 const chat=(await apiJSON(root+'getChat','',{send,method:'POST',body:{chat_id:a.accountId}})).result;if(!chat?.id||!['private','group','supergroup','channel'].includes(chat.type))throw Error('target_unavailable');
 if(chat.type!=='private'){
  const member=(await apiJSON(root+'getChatMember','',{send,method:'POST',body:{chat_id:a.accountId,user_id:bot.id}})).result;
  if(!member||['left','kicked'].includes(member.status)||member.status==='restricted'&&member.can_send_messages!==true||chat.type==='channel'&&!(['creator','administrator'].includes(member.status)&&member.can_post_messages!==false)||['group','supergroup'].includes(chat.type)&&member.status==='member'&&chat.permissions?.can_send_messages===false)throw Error('send_permission_missing');
 }
 return {status:'connected',info:{botUsername:String(bot.username||'').slice(0,100),chatTitle:String(chat.title||chat.username||chat.first_name||'Telegram').slice(0,150),chatType:chat.type}};
}
