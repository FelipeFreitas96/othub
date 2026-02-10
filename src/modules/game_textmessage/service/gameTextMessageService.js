import { MessageModeEnum } from '../../../services/client/Const'

export const TextColors = {
  red: '#f55e5e',
  orange: '#f36500',
  yellow: '#ffff00',
  green: '#00EB00',
  lightblue: '#5ff7f7',
  blue: '#9f9dfd',
  white: '#ffffff',
  grey: '#AAAAAA',
}

export const MessageSettings = {
  none: {},
  consoleYellow: { color: TextColors.yellow, consoleTab: 'Local Chat' },
  consoleRed: { color: TextColors.red, consoleTab: 'Local Chat' },
  consoleOrange: { color: TextColors.orange, consoleTab: 'Local Chat' },
  consoleBlue: { color: TextColors.blue, consoleTab: 'Local Chat' },
  centerRed: { color: TextColors.red, consoleTab: 'Server Log', screenTarget: 'lowCenterLabel' },
  centerGreen: { color: TextColors.green, consoleTab: 'Server Log', screenTarget: 'highCenterLabel' },
  centerHKGreen: { color: TextColors.green, consoleTab: 'Server Log', screenTarget: 'highCenterLabel' },
  centerWhite: { color: TextColors.white, consoleTab: 'Server Log', screenTarget: 'middleCenterLabel' },
  bottomWhite: { color: TextColors.white, consoleTab: 'Server Log', screenTarget: 'statusLabel' },
  status: { color: TextColors.white, consoleTab: 'Server Log', screenTarget: 'statusLabel' },
  statusOwn: { color: TextColors.white, consoleTab: 'Server Log' },
  statusBoosted: { color: TextColors.white, consoleTab: 'Server Log', screenTarget: 'statusLabel' },
  statusSmall: { color: TextColors.white, screenTarget: 'statusLabel' },
  private: { color: TextColors.lightblue, consoleTab: 'Local Chat', screenTarget: 'privateLabel' },
  privateRed: { color: TextColors.red, consoleTab: 'Local Chat', private: true },
  privatePlayerToPlayer: { color: TextColors.blue, consoleTab: 'Local Chat', private: true },
  privatePlayerToNpc: { color: TextColors.blue, consoleTab: 'Local Chat', private: true, npcChat: true },
  privateNpcToPlayer: { color: TextColors.lightblue, consoleTab: 'Local Chat', private: true, npcChat: true },
  channelYellow: { color: TextColors.yellow },
  channelWhite: { color: TextColors.white },
  channelRed: { color: TextColors.red },
  channelOrange: { color: TextColors.orange },
  monsterSay: { color: TextColors.orange, hideInConsole: true },
  monsterYell: { color: TextColors.orange, hideInConsole: true },
  potion: { color: TextColors.orange, hideInConsole: true },
  loot: { color: TextColors.white, consoleTab: 'Loot', screenTarget: 'highCenterLabel', colored: true },
  valuableLoot: { color: TextColors.white, consoleTab: 'Loot', screenTarget: 'statusLabel', colored: true },
}

export const MessageTypes = {
  [MessageModeEnum.MessageSay]: MessageSettings.consoleYellow,
  [MessageModeEnum.MessageWhisper]: MessageSettings.consoleYellow,
  [MessageModeEnum.MessageYell]: MessageSettings.consoleYellow,
  [MessageModeEnum.MessageMonsterSay]: MessageSettings.monsterSay,
  [MessageModeEnum.MessageMonsterYell]: MessageSettings.monsterYell,
  [MessageModeEnum.MessageBarkLow]: MessageSettings.consoleOrange,
  [MessageModeEnum.MessageBarkLoud]: MessageSettings.consoleOrange,
  [MessageModeEnum.MessageFailure]: MessageSettings.statusSmall,
  [MessageModeEnum.MessageLogin]: MessageSettings.bottomWhite,
  [MessageModeEnum.MessageGame]: MessageSettings.centerWhite,
  [MessageModeEnum.MessageStatus]: MessageSettings.status,
  [MessageModeEnum.MessageWarning]: MessageSettings.centerRed,
  [MessageModeEnum.MessageLook]: MessageSettings.centerGreen,
  [MessageModeEnum.MessageRed]: MessageSettings.consoleRed,
  [MessageModeEnum.MessageBlue]: MessageSettings.consoleBlue,
  [MessageModeEnum.MessagePrivateFrom]: MessageSettings.private,
  [MessageModeEnum.MessagePrivateTo]: MessageSettings.privatePlayerToPlayer,
  [MessageModeEnum.MessageGamemasterPrivateFrom]: MessageSettings.privateRed,
  [MessageModeEnum.MessageNpcTo]: MessageSettings.privatePlayerToNpc,
  [MessageModeEnum.MessageNpcFrom]: MessageSettings.privateNpcToPlayer,
  [MessageModeEnum.MessageNpcFromStartBlock]: MessageSettings.privateNpcToPlayer,
  [MessageModeEnum.MessageChannel]: MessageSettings.channelYellow,
  [MessageModeEnum.MessageChannelManagement]: MessageSettings.channelWhite,
  [MessageModeEnum.MessageGamemasterChannel]: MessageSettings.channelRed,
  [MessageModeEnum.MessageChannelHighlight]: MessageSettings.channelOrange,
  [MessageModeEnum.MessageSpell]: MessageSettings.consoleYellow,
  [MessageModeEnum.MessageRVRChannel]: MessageSettings.channelWhite,
  [MessageModeEnum.MessageRVRContinue]: MessageSettings.consoleYellow,
  [MessageModeEnum.MessageGamemasterBroadcast]: MessageSettings.consoleRed,
  [MessageModeEnum.MessageDamageDealed]: MessageSettings.statusOwn,
  [MessageModeEnum.MessageDamageReceived]: MessageSettings.statusOwn,
  [MessageModeEnum.MessageHeal]: MessageSettings.statusOwn,
  [MessageModeEnum.MessageExp]: MessageSettings.statusOwn,
  [MessageModeEnum.MessageDamageOthers]: MessageSettings.statusOwn,
  [MessageModeEnum.MessageHealOthers]: MessageSettings.statusOwn,
  [MessageModeEnum.MessageExpOthers]: MessageSettings.statusOwn,
  [MessageModeEnum.MessagePotion]: MessageSettings.potion,
  [MessageModeEnum.MessageTradeNpc]: MessageSettings.centerGreen,
  [MessageModeEnum.MessageGuild]: MessageSettings.statusOwn,
  [MessageModeEnum.MessageParty]: MessageSettings.statusOwn,
  [MessageModeEnum.MessagePartyManagement]: MessageSettings.centerGreen,
  [MessageModeEnum.MessageGameHighlight]: MessageSettings.centerRed,
  [MessageModeEnum.MessageHotkeyUse]: MessageSettings.centerGreen,
  [MessageModeEnum.MessageAttention]: MessageSettings.bottomWhite,
  [MessageModeEnum.MessageBoostedCreature]: MessageSettings.centerWhite,
  [MessageModeEnum.MessageOfflineTrainning]: MessageSettings.centerWhite,
  [MessageModeEnum.MessageTransaction]: MessageSettings.centerWhite,
  [254]: MessageSettings.private,
}

export function calculateVisibleTime(text) {
  return Math.max(String(text || '').length * 50, 4000)
}

export function getMessageType(mode, clientVersion = 860) {
  if (clientVersion >= 1300) {
    MessageTypes[MessageModeEnum.MessageGuild] = MessageSettings.statusOwn
    MessageTypes[MessageModeEnum.MessageParty] = MessageSettings.statusOwn
  } else {
    MessageTypes[MessageModeEnum.MessageGuild] = MessageSettings.centerGreen
    MessageTypes[MessageModeEnum.MessageParty] = MessageSettings.centerGreen
  }
  return MessageTypes[mode] ?? MessageSettings.none
}
