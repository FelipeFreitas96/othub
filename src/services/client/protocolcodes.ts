/*
 * Copyright (c) 2010-2026 OTClient <https://github.com/edubart/otclient>
 * Port of src/client/protocolcodes.h + protocolcodes.cpp
 */

import { Otc } from './Const'

export namespace Proto {
  export enum LoginServerOpts {
    LoginServerError = 10,
    LoginServerMotd = 20,
    LoginServerUpdateNeeded = 30,
    LoginServerCharacterList = 100,
  }

  export enum ItemOpcode {
    StaticText = 96,
    UnknownCreature = 97,
    OutdatedCreature = 98,
    Creature = 99,
  }

  export enum GameServerOpcodes {
    GameServerLoginOrPendingState = 10,
    GameServerGMActions = 11,
    GameServerEnterGame = 15,
    GameServerUpdateNeeded = 17,
    GameServerLoginError = 20,
    GameServerLoginAdvice = 21,
    GameServerLoginWait = 22,
    GameServerLoginSuccess = 23,
    GameServerSessionEnd = 24,
    GameServerStoreButtonIndicators = 25,
    GameServerBugReport = 26,
    GameServerPingBack = 29,
    GameServerPing = 30,
    GameServerChallenge = 31,
    GameServerDeath = 40,
    GameServerSupplyStash = 41,
    GameServerSpecialContainer = 42,
    GameServerPartyAnalyzer = 43,
    GameServerFirstGameOpcode = 50,
    GameServerExtendedOpcode = 50,
    GameServerChangeMapAwareRange = 51,
    GameServerAttchedEffect = 52,
    GameServerDetachEffect = 53,
    GameServerCreatureShader = 54,
    GameServerMapShader = 55,
    GameServerCreatureTyping = 56,
    GameServerAttachedPaperdoll = 60,
    GameServerDetachPaperdoll = 61,
    GameServerFeatures = 67,
    GameServerFloorDescription = 75,
    GameServerFullMap = 100,
    GameServerMapTopRow = 101,
    GameServerMapRightRow = 102,
    GameServerMapBottomRow = 103,
    GameServerMapLeftRow = 104,
    GameServerUpdateTile = 105,
    GameServerCreateOnMap = 106,
    GameServerChangeOnMap = 107,
    GameServerDeleteOnMap = 108,
    GameServerMoveCreature = 109,
    GameServerOpenContainer = 110,
    GameServerCloseContainer = 111,
    GameServerCreateContainer = 112,
    GameServerChangeInContainer = 113,
    GameServerDeleteInContainer = 114,
    GameServerSetInventory = 120,
    GameServerDeleteInventory = 121,
    GameServerOpenNpcTrade = 122,
    GameServerPlayerGoods = 123,
    GameServerCloseNpcTrade = 124,
    GameServerOwnTrade = 125,
    GameServerCounterTrade = 126,
    GameServerCloseTrade = 127,
    GameServerTextEffect = 132,
    GameServerTextMessage = 180,
    GameServerCancelWalk = 181,
    GameServerWalkWait = 182,
    GameServerChooseOutfit = 200,
    GameServerVipAdd = 210,
    GameServerVipState = 211,
    GameServerVipLogout = 212,
    GameServerTutorialHint = 220,
    GameServerAutomapFlag = 221,
    GameServerModalDialog = 250,
    GameServerStore = 251,
    GameServerStoreOffers = 252,
    GameServerStoreTransactionHistory = 253,
    GameServerStoreCompletePurchase = 254,
  }

  export enum ClientOpcodes {
    ClientEnterAccount = 1,
    ClientPendingGame = 10,
    ClientEnterGame = 15,
    ClientLeaveGame = 20,
    ClientPing = 29,
    ClientPingBack = 30,
    ClientFirstGameOpcode = 50,
    ClientExtendedOpcode = 50,
    ClientChangeMapAwareRange = 51,
    ClientAutoWalk = 100,
    ClientWalkNorth = 101,
    ClientWalkEast = 102,
    ClientWalkSouth = 103,
    ClientWalkWest = 104,
    ClientStop = 105,
    ClientWalkNorthEast = 106,
    ClientWalkSouthEast = 107,
    ClientWalkSouthWest = 108,
    ClientWalkNorthWest = 109,
    ClientTurnNorth = 111,
    ClientTurnEast = 112,
    ClientTurnSouth = 113,
    ClientTurnWest = 114,
    ClientLook = 140,
    ClientLookCreature = 141,
    ClientTalk = 150,
    ClientRequestChannels = 151,
    ClientJoinChannel = 152,
    ClientLeaveChannel = 153,
    ClientOpenPrivateChannel = 154,
    ClientChangeFightModes = 160,
    ClientAttack = 161,
    ClientFollow = 162,
    ClientCancelAttackAndFollow = 190,
    ClientRequestOutfit = 210,
    ClientChangeOutfit = 211,
    ClientAddVip = 220,
    ClientRemoveVip = 221,
    ClientEditVip = 222,
    ClientRequestQuestLog = 240,
    ClientRequestQuestLine = 241,
    ClientAnswerModalDialog = 249,
    ClientOpenStore = 250,
    ClientRequestStoreOffers = 251,
    ClientBuyStoreOffer = 252,
    ClientRequestTransactionHistory = 254,
  }

  export enum CreatureType {
    CreatureTypePlayer = 0,
    CreatureTypeMonster = 1,
    CreatureTypeNpc = 2,
    CreatureTypeSummonOwn = 3,
    CreatureTypeSummonOther = 4,
    CreatureTypeHidden = 5,
    CreatureTypeUnknown = 0xff,
  }

  export enum CreaturesIdRange {
    PlayerStartId = 0x10000000,
    PlayerEndId = 0x40000000,
    MonsterStartId = 0x40000000,
    MonsterEndId = 0x80000000,
    NpcStartId = 0x80000000,
    NpcEndId = 0xffffffff,
  }

  const messageModesMap = new Map<Otc.MessageMode, number>()

  export function buildMessageModesMap(version: number): void {
    messageModesMap.clear()
    if (version >= 1094) {
      messageModesMap.set(Otc.MessageMode.MessageMana, 43)
    }
    if (version >= 1055) {
      messageModesMap.set(Otc.MessageMode.MessageNone, 0)
      messageModesMap.set(Otc.MessageMode.MessageSay, 1)
      messageModesMap.set(Otc.MessageMode.MessageWhisper, 2)
      messageModesMap.set(Otc.MessageMode.MessageYell, 3)
      messageModesMap.set(Otc.MessageMode.MessagePrivateFrom, 4)
      messageModesMap.set(Otc.MessageMode.MessagePrivateTo, 5)
      messageModesMap.set(Otc.MessageMode.MessageChannelManagement, 6)
      messageModesMap.set(Otc.MessageMode.MessageChannel, 7)
      messageModesMap.set(Otc.MessageMode.MessageChannelHighlight, 8)
      messageModesMap.set(Otc.MessageMode.MessageSpell, 9)
      messageModesMap.set(Otc.MessageMode.MessageNpcFromStartBlock, 10)
      messageModesMap.set(Otc.MessageMode.MessageNpcFrom, 11)
      messageModesMap.set(Otc.MessageMode.MessageNpcTo, 12)
      messageModesMap.set(Otc.MessageMode.MessageGamemasterBroadcast, 13)
      messageModesMap.set(Otc.MessageMode.MessageGamemasterChannel, 14)
      messageModesMap.set(Otc.MessageMode.MessageGamemasterPrivateFrom, 15)
      messageModesMap.set(Otc.MessageMode.MessageGamemasterPrivateTo, 16)
      messageModesMap.set(Otc.MessageMode.MessageLogin, 17)
      messageModesMap.set(Otc.MessageMode.MessageWarning, 18)
      messageModesMap.set(Otc.MessageMode.MessageGame, 19)
      messageModesMap.set(Otc.MessageMode.MessageGameHighlight, 20)
      messageModesMap.set(Otc.MessageMode.MessageFailure, 21)
      messageModesMap.set(Otc.MessageMode.MessageLook, 22)
      messageModesMap.set(Otc.MessageMode.MessageDamageDealed, 23)
      messageModesMap.set(Otc.MessageMode.MessageDamageReceived, 24)
      messageModesMap.set(Otc.MessageMode.MessageHeal, 25)
      messageModesMap.set(Otc.MessageMode.MessageExp, 26)
      messageModesMap.set(Otc.MessageMode.MessageDamageOthers, 27)
      messageModesMap.set(Otc.MessageMode.MessageHealOthers, 28)
      messageModesMap.set(Otc.MessageMode.MessageExpOthers, 29)
      messageModesMap.set(Otc.MessageMode.MessageStatus, 30)
      messageModesMap.set(Otc.MessageMode.MessageLoot, 31)
      messageModesMap.set(Otc.MessageMode.MessageTradeNpc, 32)
      messageModesMap.set(Otc.MessageMode.MessageGuild, 33)
      messageModesMap.set(Otc.MessageMode.MessagePartyManagement, 34)
      messageModesMap.set(Otc.MessageMode.MessageParty, 35)
      messageModesMap.set(Otc.MessageMode.MessageBarkLow, 36)
      messageModesMap.set(Otc.MessageMode.MessageBarkLoud, 37)
      messageModesMap.set(Otc.MessageMode.MessageReport, 38)
      messageModesMap.set(Otc.MessageMode.MessageHotkeyUse, 39)
      messageModesMap.set(Otc.MessageMode.MessageTutorialHint, 40)
      messageModesMap.set(Otc.MessageMode.MessageThankyou, 41)
      messageModesMap.set(Otc.MessageMode.MessageMarket, 42)
      messageModesMap.set(Otc.MessageMode.MessageMana, 43)
      messageModesMap.set(Otc.MessageMode.MessageBeyondLast, 44)
      messageModesMap.set(Otc.MessageMode.MessageAttention, 48)
      messageModesMap.set(Otc.MessageMode.MessageBoostedCreature, 49)
      messageModesMap.set(Otc.MessageMode.MessageOfflineTrainning, 50)
      messageModesMap.set(Otc.MessageMode.MessageTransaction, 51)
      messageModesMap.set(Otc.MessageMode.MessagePotion, 52)
    } else if (version >= 1041) {
      messageModesMap.set(Otc.MessageMode.MessageNone, 0)
      messageModesMap.set(Otc.MessageMode.MessageSay, 1)
      messageModesMap.set(Otc.MessageMode.MessageWhisper, 2)
      messageModesMap.set(Otc.MessageMode.MessageYell, 3)
      messageModesMap.set(Otc.MessageMode.MessagePrivateFrom, 4)
      messageModesMap.set(Otc.MessageMode.MessagePrivateTo, 5)
      messageModesMap.set(Otc.MessageMode.MessageChannelManagement, 6)
      messageModesMap.set(Otc.MessageMode.MessageChannel, 7)
      messageModesMap.set(Otc.MessageMode.MessageChannelHighlight, 8)
      messageModesMap.set(Otc.MessageMode.MessageSpell, 9)
      messageModesMap.set(Otc.MessageMode.MessageNpcFromStartBlock, 10)
      messageModesMap.set(Otc.MessageMode.MessageNpcFrom, 11)
      messageModesMap.set(Otc.MessageMode.MessageNpcTo, 12)
      messageModesMap.set(Otc.MessageMode.MessageGamemasterBroadcast, 13)
      messageModesMap.set(Otc.MessageMode.MessageGamemasterChannel, 14)
      messageModesMap.set(Otc.MessageMode.MessageGamemasterPrivateFrom, 15)
      messageModesMap.set(Otc.MessageMode.MessageGamemasterPrivateTo, 16)
      messageModesMap.set(Otc.MessageMode.MessageLogin, 17)
      messageModesMap.set(Otc.MessageMode.MessageWarning, 18)
      messageModesMap.set(Otc.MessageMode.MessageGame, 19)
      messageModesMap.set(Otc.MessageMode.MessageFailure, 20)
      messageModesMap.set(Otc.MessageMode.MessageLook, 21)
      messageModesMap.set(Otc.MessageMode.MessageDamageDealed, 22)
      messageModesMap.set(Otc.MessageMode.MessageDamageReceived, 23)
      messageModesMap.set(Otc.MessageMode.MessageHeal, 24)
      messageModesMap.set(Otc.MessageMode.MessageExp, 25)
      messageModesMap.set(Otc.MessageMode.MessageDamageOthers, 26)
      messageModesMap.set(Otc.MessageMode.MessageHealOthers, 27)
      messageModesMap.set(Otc.MessageMode.MessageExpOthers, 28)
      messageModesMap.set(Otc.MessageMode.MessageStatus, 29)
      messageModesMap.set(Otc.MessageMode.MessageLoot, 30)
      messageModesMap.set(Otc.MessageMode.MessageTradeNpc, 31)
      messageModesMap.set(Otc.MessageMode.MessageGuild, 32)
      messageModesMap.set(Otc.MessageMode.MessagePartyManagement, 33)
      messageModesMap.set(Otc.MessageMode.MessageParty, 34)
      messageModesMap.set(Otc.MessageMode.MessageBarkLow, 35)
      messageModesMap.set(Otc.MessageMode.MessageBarkLoud, 36)
      messageModesMap.set(Otc.MessageMode.MessageReport, 37)
      messageModesMap.set(Otc.MessageMode.MessageHotkeyUse, 38)
      messageModesMap.set(Otc.MessageMode.MessageTutorialHint, 49)
      messageModesMap.set(Otc.MessageMode.MessageThankyou, 40)
      messageModesMap.set(Otc.MessageMode.MessageMarket, 41)
    } else if (version >= 1036) {
      for (let i = Otc.MessageMode.MessageNone; i <= Otc.MessageMode.MessageBeyondLast; i++) {
        if (i >= Otc.MessageMode.MessageNpcTo) {
          messageModesMap.set(i, i + 1)
        } else {
          messageModesMap.set(i, i)
        }
      }
    } else if (version >= 900) {
      for (let i = Otc.MessageMode.MessageNone; i <= Otc.MessageMode.MessageBeyondLast; i++) {
        messageModesMap.set(i, i)
      }
    } else if (version >= 861) {
      messageModesMap.set(Otc.MessageMode.MessageNone, 0)
      messageModesMap.set(Otc.MessageMode.MessageSay, 1)
      messageModesMap.set(Otc.MessageMode.MessageWhisper, 2)
      messageModesMap.set(Otc.MessageMode.MessageYell, 3)
      messageModesMap.set(Otc.MessageMode.MessageNpcTo, 4)
      messageModesMap.set(Otc.MessageMode.MessageNpcFrom, 5)
      messageModesMap.set(Otc.MessageMode.MessagePrivateFrom, 6)
      messageModesMap.set(Otc.MessageMode.MessagePrivateTo, 6)
      messageModesMap.set(Otc.MessageMode.MessageChannel, 7)
      messageModesMap.set(Otc.MessageMode.MessageChannelManagement, 8)
      messageModesMap.set(Otc.MessageMode.MessageGamemasterBroadcast, 9)
      messageModesMap.set(Otc.MessageMode.MessageGamemasterChannel, 10)
      messageModesMap.set(Otc.MessageMode.MessageGamemasterPrivateFrom, 11)
      messageModesMap.set(Otc.MessageMode.MessageGamemasterPrivateTo, 11)
      messageModesMap.set(Otc.MessageMode.MessageChannelHighlight, 12)
      messageModesMap.set(Otc.MessageMode.MessageMonsterSay, 13)
      messageModesMap.set(Otc.MessageMode.MessageMonsterYell, 14)
      messageModesMap.set(Otc.MessageMode.MessageWarning, 15)
      messageModesMap.set(Otc.MessageMode.MessageGame, 16)
      messageModesMap.set(Otc.MessageMode.MessageLogin, 17)
      messageModesMap.set(Otc.MessageMode.MessageStatus, 18)
      messageModesMap.set(Otc.MessageMode.MessageLook, 19)
      messageModesMap.set(Otc.MessageMode.MessageFailure, 20)
      messageModesMap.set(Otc.MessageMode.MessageBlue, 21)
      messageModesMap.set(Otc.MessageMode.MessageRed, 22)
    } else if (version >= 840) {
      messageModesMap.set(Otc.MessageMode.MessageNone, 0)
      messageModesMap.set(Otc.MessageMode.MessageSay, 1)
      messageModesMap.set(Otc.MessageMode.MessageWhisper, 2)
      messageModesMap.set(Otc.MessageMode.MessageYell, 3)
      messageModesMap.set(Otc.MessageMode.MessageNpcTo, 4)
      messageModesMap.set(Otc.MessageMode.MessageNpcFromStartBlock, 5)
      messageModesMap.set(Otc.MessageMode.MessagePrivateFrom, 6)
      messageModesMap.set(Otc.MessageMode.MessagePrivateTo, 6)
      messageModesMap.set(Otc.MessageMode.MessageChannel, 7)
      messageModesMap.set(Otc.MessageMode.MessageChannelManagement, 8)
      messageModesMap.set(Otc.MessageMode.MessageRVRChannel, 9)
      messageModesMap.set(Otc.MessageMode.MessageRVRAnswer, 10)
      messageModesMap.set(Otc.MessageMode.MessageRVRContinue, 11)
      messageModesMap.set(Otc.MessageMode.MessageGamemasterBroadcast, 12)
      messageModesMap.set(Otc.MessageMode.MessageGamemasterChannel, 13)
      messageModesMap.set(Otc.MessageMode.MessageGamemasterPrivateFrom, 14)
      messageModesMap.set(Otc.MessageMode.MessageGamemasterPrivateTo, 14)
      messageModesMap.set(Otc.MessageMode.MessageChannelHighlight, 15)
      messageModesMap.set(Otc.MessageMode.MessageRed, 18)
      messageModesMap.set(Otc.MessageMode.MessageMonsterSay, 19)
      messageModesMap.set(Otc.MessageMode.MessageMonsterYell, 20)
      messageModesMap.set(Otc.MessageMode.MessageWarning, 21)
      messageModesMap.set(Otc.MessageMode.MessageGame, 22)
      messageModesMap.set(Otc.MessageMode.MessageLogin, 23)
      messageModesMap.set(Otc.MessageMode.MessageStatus, 24)
      messageModesMap.set(Otc.MessageMode.MessageLook, 25)
      messageModesMap.set(Otc.MessageMode.MessageFailure, 26)
      messageModesMap.set(Otc.MessageMode.MessageBlue, 27)
    } else if (version >= 740) {
      messageModesMap.set(Otc.MessageMode.MessageNone, 0)
      messageModesMap.set(Otc.MessageMode.MessageSay, 1)
      messageModesMap.set(Otc.MessageMode.MessageWhisper, 2)
      messageModesMap.set(Otc.MessageMode.MessageYell, 3)
      messageModesMap.set(Otc.MessageMode.MessagePrivateFrom, 4)
      messageModesMap.set(Otc.MessageMode.MessagePrivateTo, 4)
      messageModesMap.set(Otc.MessageMode.MessageChannel, 5)
      messageModesMap.set(Otc.MessageMode.MessageRVRChannel, 6)
      messageModesMap.set(Otc.MessageMode.MessageRVRAnswer, 7)
      messageModesMap.set(Otc.MessageMode.MessageRVRContinue, 8)
      messageModesMap.set(Otc.MessageMode.MessageGamemasterBroadcast, 9)
      messageModesMap.set(Otc.MessageMode.MessageGamemasterChannel, 10)
      messageModesMap.set(Otc.MessageMode.MessageGamemasterPrivateFrom, 11)
      messageModesMap.set(Otc.MessageMode.MessageGamemasterPrivateTo, 11)
      messageModesMap.set(Otc.MessageMode.MessageChannelHighlight, 12)
      messageModesMap.set(Otc.MessageMode.MessageMonsterSay, 16)
      messageModesMap.set(Otc.MessageMode.MessageMonsterYell, 17)
      messageModesMap.set(Otc.MessageMode.MessageWarning, 18)
      messageModesMap.set(Otc.MessageMode.MessageGame, 19)
      messageModesMap.set(Otc.MessageMode.MessageLogin, 20)
      messageModesMap.set(Otc.MessageMode.MessageStatus, 21)
      messageModesMap.set(Otc.MessageMode.MessageLook, 22)
      messageModesMap.set(Otc.MessageMode.MessageFailure, 23)
      messageModesMap.set(Otc.MessageMode.MessageBlue, 24)
      messageModesMap.set(Otc.MessageMode.MessageRed, 25)
    }
  }

  export function translateMessageModeFromServer(mode: number): Otc.MessageMode {
    for (const [k, v] of messageModesMap) {
      if (v === mode) return k
    }
    return Otc.MessageMode.MessageInvalid
  }

  export function translateMessageModeToServer(mode: Otc.MessageMode): number {
    if (mode >= Otc.MessageMode.LastMessage) {
      return Otc.MessageMode.MessageInvalid
    }
    const v = messageModesMap.get(mode)
    if (v !== undefined) return v
    return Otc.MessageMode.MessageInvalid
  }
}
