(function(){
'use strict';
const records=[
{
id:'rpg-outlaws-thief-1',name:'Thief',role:'Outlaws',race:'',level:1,bod:7,dex:9,mnd:8,cha:6,hp:17,hpMax:17,mana:0,manaMax:0,drArmor:0,drNatural:0,drMagic:0,nl:0,speed:25,
attack:'BOD 7 / DEX 9',defense:'BOD 7 / DEX 9',
weapons:'Weapon (1): 2 Daggers 1d4 | Brass Knuckles 1d4 + Unarmed | Handcrossbow 1d4 (8 bolts)',
armor:'None',
feats:'Light Melee Prof R0 or Ranged Proficiency R0 | Thief R0 | Squirrelly1 R0',
tactics:'Drive: Get paid, don’t die.\nApproach unseen when possible. Move at least 15 ft per turn to trigger Squirrelly1. Flank isolated targets. Avoid fair fights with heavily armed opponents and obvious casters. Flee below 5 HP or when the last ally standing.',
notes:'Attribute values in parentheses: BOD (2), DEX (3), MND (2), CHA (2).\nSkill Bonuses: +2 Stealth, Finesse, Handle Device, Detect | +2 DEX DEF when moved 15 ft+'
},
{
id:'rpg-outlaws-thug-1',name:'Thug',role:'Outlaws',race:'',level:1,bod:9,dex:9,mnd:6,cha:6,hp:19,hpMax:19,mana:0,manaMax:0,drArmor:2,drNatural:0,drMagic:0,nl:0,speed:25,
attack:'BOD 9 / DEX 9',defense:'BOD 9 / DEX 9',
weapons:'Weapon (1): Mace 1d6 | Brass Knuckles 1d4 + Unarmed | Handaxe 1d6 | Unarmed 3 dmg',
armor:'Heavy Coat 2 DR / 0 DEF / 0 DEX pen (Dex attacks do not bypass)',
feats:'Light Melee Prof R0 or Improved Unarmed3 R0 | Bully1 R0 | Unbreakable2 R0',
tactics:'Drive: Don’t let no one get in my way.\nTaunt first to trigger Bully1. Close distance quickly and engage the largest apparent threat. Once adjacent, move no more than 5 feet to trigger Unbreakable2. If using Improved Unarmed3, remain in place and make two attacks as an FRA.',
notes:'Attribute values in parentheses: BOD (3), DEX (3), MND (2), CHA (2).\nSkill Bonuses: +2 to Intimidate (CHA/BOD) to Taunt | +2 BOD DEF when moved 5 ft or less | FRA 2 attacks with Unarmed'
},
{
id:'rpg-outlaws-bandit-3',name:'Bandit',role:'Outlaws',race:'',level:3,bod:8,dex:10,mnd:9,cha:7,hp:28,hpMax:28,mana:0,manaMax:0,drArmor:1,drNatural:0,drMagic:0,nl:0,speed:30,
attack:'BOD 10 / DEX 12',defense:'BOD 9 / DEX 10',
weapons:'Weapon (2): 2 Daggers 1d4 | Light Crossbow 1d6 (8 bolts) | Handaxe 1d6 | Shortsword 1d6',
armor:'Leather Cuirass 1 DR / 1 DEF / 0 DEX pen',
feats:'Light Melee Prof4 R1 or Ranged Proficiency R1 | Sneak Attack2 R0 or Bullseye3 R0\nThief R1 | Squirrelly1 R0 | Bonus Attack5 1',
tactics:'Drive: Get paid, don’t die.\nApproach unseen when possible. Move at least 15 ft per turn to trigger Squirrelly1. Flank isolated or unaware targets to trigger Sneak Attack2. If attacking from range, hide first to trigger Bullseye3. Use FRA to attack with Light Melee4 twice. Use Bonus Attack5 to capitalize on melee attacks or reload crossbow at range. Avoid fair fights with heavily armed opponents and obvious casters. Flee below 5 HP or when the last ally standing.',
notes:'Attribute values in parentheses: BOD (2), DEX (3), MND (3), CHA (2).\nSkill Bonuses: +4 Stealth, Finesse, Handle Device, Detect | +2 DEX DEF when moved 15 ft+\n+2 to hit, FRA 2 attacks with Light Melee | +2 to hit with Ranged weapon'
},
{
id:'rpg-outlaws-gang-member-3',name:'Gang Member',role:'Outlaws',race:'',level:3,bod:10,dex:10,mnd:7,cha:7,hp:30,hpMax:30,mana:0,manaMax:0,drArmor:2,drNatural:0,drMagic:0,nl:0,speed:30,
attack:'BOD 12 / DEX 12',defense:'BOD 12 / DEX 10',
weapons:'Weapon (1): Morningstar 1d8+2/+5 (sw) | Brass Knuckles 1d4 + Unarmed',
armor:'Full Leather 2 DR / 2 DEF / 0 DEX pen',
feats:'Light Melee Prof R0 + Improved Unarmed3 R1 or Med. Melee Proficiency R1\nBully1 R1 | Unbreakable2 R0 | Combo Breaker R0 | Bonus Attack 1',
tactics:'Drive: Don’t let no one get in my way.\nTaunt first to trigger Bully1. Close distance quickly and engage the largest apparent threat. Once adjacent, move no more than 5 feet to trigger Unbreakable2. If using Improved Unarmed3, remain in place and make 3 attacks as an FRA. If using Med. Melee4 make attack with +2 to hit and damage. Use Bonus Attack5 to capitalize on melee damage. Try to crit defend to trigger Combo Breaker6 and end enemy’s turn.',
notes:'Attribute values in parentheses: BOD (3), DEX (3), MND (2), CHA (2).\nSkill Bonuses: +4 to Intimidate (CHA/BOD) to Taunt, +1 additional stack of Taunt | +2 BOD DEF when moved 5 ft or less | +2 to hit, FRA 3 attacks with Unarmed | +2 to hit and damage with Medium Melee weapons'
},
{
id:'rpg-outlaws-arcane-trickster-3',name:'Arcane Trickster',role:'Outlaws',race:'',level:3,bod:6,dex:8,mnd:9,cha:10,hp:26,hpMax:26,mana:35,manaMax:35,drArmor:2,drNatural:0,drMagic:0,nl:0,speed:25,
attack:'BOD 6 / DEX 8 | CST CHA 12',defense:'BOD 8 / DEX 8',
weapons:'Weapon (1): Dagger 1d4 | Club 1d4 | Handcrossbow 1d4 (8 bolts)',
armor:'Full Leather 2 DR / 2 DEF / 0 DEX pen',
feats:'Light Melee Prof2 R0 or Ranged Prof3 R0 | Spontaneous Spellcaster R1 | Squirrelly1 R1\nThief R0 | Bonus Attack4 1',
tactics:'Drive: Take their coin, have a laugh along the way.\nApproach unseen when possible. Move at least 15 ft per turn to trigger Squirrelly1. Use spells liberally, start with Rock Skin5 to protect self. Attack with Melee2 or Ranged3 using Bonus Attack4. Heal with Healing Touch6 if below 10 HP. Flee below 5 HP or when the last ally standing.',
notes:'Attribute values in parentheses: BOD (2), DEX (2), MND (3), CHA (3).\nSkill Bonuses: +2 Stealth, Finesse, Handle Device, Detect | +4 DEX DEF when moved 15 ft+\n\nArcane Trickster Spells — Spontaneous Caster; Mage Eyes (Arcane); Instinctual Caster. Mana: 35/35.\nMinor Magecraft: Spark 10 ft | Clean, Knock, or Click 30 ft | Light 5 ft Bright, 5 ft Dim | Telekinesis object 10 lbs or less. Target --; Range --; Duration Con.; Manacost 2.\nBury the Trail: Hide any footprints, bent grass, broken branches, powder, blood, or scent of target creature and anything on their person, making them impossible to track mundanely. Target 1 Creature; Range Touch; Duration 1 Hour; Manacost 3.\nDuplicate Image: Make 3 copies of target within 5 feet of the target. These copies can trigger flanking. Target 1 Creature; Range 30 ft; Duration 1d4+3 R; Manacost 5.\nPhantasmal Projectiles: Create illusory projectiles (like arrows, bolts, etc). MND save to disbelieve. Failing the save causes a -4 penalty to next defense check, -6 if against a projectile. Target 1 Creature; Range 30 ft; Duration Instant; Manacost 1.\nRock Skin5: DR becomes 2/3/0; BOD DEF becomes 10. Target 1 Creature; Range Touch; Duration 1 Minute; Manacost 3.\nLacerate: Deal 1d6+3 dmg and Bleed stacks. DEX save against the caster’s Caster check. Target 1 Creature; Range Touch; Duration Instant; Manacost 4.\nHealing Touch6: Target heals 1d6+3 points of health. Target 1 Creature; Range Touch; Duration Instant; Manacost 4.'
}
];
window.RPGStarterBestiary=records.map(record=>({...record,conditions:'',tokenImage:''}));
})();