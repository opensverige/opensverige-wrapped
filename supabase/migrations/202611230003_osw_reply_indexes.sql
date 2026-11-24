create index if not exists osw_messages_channel_message
on public.osw_member_messages(channel_id,message_id);
create index if not exists osw_messages_reply_target
on public.osw_member_messages(channel_id,((message->'message_reference')->>'message_id'))
where message->>'type'='19';
