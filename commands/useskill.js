const { SlashCommandBuilder } = require("discord.js");
const path = require("path");
const fs = require("fs");
const creatures = require("../constants/creatures");
const relics = require("../constants/relics");
const enemyCreatures = require("../constants/enemyCreatures");

let drachmas;
let playerCreature;
let chosenRelic;
let playerCreatureHP;
let playerCreatureMP;
let enemyCreature;
let enemyCreatureHP;
let combatAlert;
let counterRef;
let mpRef;

// loads game info
const loadGameData = (gamesPath, re) => {
  return new Promise((resolve, reject) => {
    try {
      fs.readFile(gamesPath, "utf8", (err, data) => {
        if (err) reject(err);

        let gameInfo;

        if (!re.test(data)) {
          resolve();
          return;
        }

        gameInfo = data.match(re)[0].split(",");
        drachmas = parseInt(gameInfo[1]);
        playerCreature = creatures[gameInfo[2]];
        chosenRelic = relics[gameInfo[3]];
        playerCreatureHP = parseFloat(gameInfo[4]);
        playerCreatureMP = parseFloat(gameInfo[5]);
        enemyCreature = enemyCreatures[parseInt(gameInfo[6])];
        enemyCreatureHP = parseFloat(gameInfo[7]);

        if (playerCreatureHP <= 0) {
          enemyCreature =
            enemyCreatures[Math.floor(Math.random() * enemyCreatures.length)];
          enemyCreatureHP = enemyCreature.hp;
          playerCreatureHP = playerCreature.hp;
          playerCreatureMP = playerCreature.mp;
        }

        if (enemyCreatureHP <= 0) {
          enemyCreature =
            enemyCreatures[Math.floor(Math.random() * enemyCreatures.length)];
          enemyCreatureHP = enemyCreature.hp;
          playerCreatureHP = playerCreature.hp;
          playerCreatureMP = playerCreature.mp;
        }

        counterRef = 0;
        mpRef = playerCreatureMP;
        resolve(data);
      });
    } catch (err) {
      reject(err);
    }
  });
};

// regens player creature mp
const regenMP = () => {
  if (
    playerCreatureMP !== playerCreature.mp + chosenRelic.mpMod &&
    playerCreatureMP + playerCreature.mpRegen + chosenRelic.mpRegenMod <=
      playerCreature.mp + chosenRelic.mpMod
  ) {
    playerCreatureMP =
      playerCreatureMP + playerCreature.mpRegen + chosenRelic.mpRegenMod;
    return;
  }

  playerCreatureMP = playerCreature.mp + chosenRelic.mpMod;
};

// checks for player death, and damages player otherwise
const dieOrTakeDamage = (playerCreatureDefense, criticalMultiplier) => {
  if (
    playerCreatureHP -
      (enemyCreature.attack - enemyCreature.attack * playerCreatureDefense) *
        criticalMultiplier <=
    0
  ) {
    combatAlert = "Defeat!";
    playerCreatureHP = 0;
    return;
  }

  playerCreatureHP =
    playerCreatureHP -
    (enemyCreature.attack - enemyCreature.attack * playerCreatureDefense) *
      criticalMultiplier;
};

// initiates chance of enemy counter attack
const receiveEnemyCounterAttack = (chancePlayer, moveName, moveType) => {
  try {
    const playerCreatureSpeed = playerCreature.speed + chosenRelic.speedMod;
    let playerCreatureDefense =
      (playerCreature.defense + chosenRelic.defenseMod) / 100;
    let enemyCreatureCritical = enemyCreature.critical / 100;
    let criticalMultiplier = 1;
    let chanceEnemy = false;

    if (enemyCreature.attackType === "Magic") playerCreatureDefense = 0;

    // checks enemy creature speed vs player creature speed and sets chance
    if (enemyCreature.speed < playerCreatureSpeed) {
      chanceEnemy = Math.random() >= 0.5;
    } else {
      chanceEnemy = Math.random() >= 0.8;
    }

    if (counterRef > 1 && !chanceEnemy && !chancePlayer) chanceEnemy = true;

    // series of checks for enemy counter attack based on chance/speed
    if (!chanceEnemy && chancePlayer) combatAlert = "Enemy was too slow!";

    if (!chanceEnemy && !chancePlayer) {
      if (moveName !== playerCreature.attackName) {
        playerCreatureMP = mpRef;
      }

      counterRef += 1;
      attackEnemyOrHeal(moveName, moveType);
      return;
    }

    if (moveName === playerCreature.attackName) {
      regenMP();
    }

    if (chanceEnemy && chancePlayer) combatAlert = "Both abilities succeeded.";

    // checks for player chance/speed failure
    if (chanceEnemy && !chancePlayer) combatAlert = "Your summon was too slow!";

    if (chanceEnemy) {
      // checks for enemy critical hit
      if (Math.random() <= enemyCreatureCritical) criticalMultiplier = 1.5;

      if (enemyCreature.attackType === "Poison" && criticalMultiplier === 1)
        criticalMultiplier = 1.5;

      dieOrTakeDamage(playerCreatureDefense, criticalMultiplier);
    }
  } catch (err) {
    console.log(err);
  }
};

// completes player lifesteal check and heal
const checkLifesteal = (
  playerCreatureSpecial,
  criticalMultiplier,
  chancePlayer,
  moveName,
  moveType
) => {
  if (moveType === "Lifesteal" && chancePlayer) {
    if (
      playerCreatureHP + playerCreatureSpecial * criticalMultiplier * 0.2 >
      playerCreature.hp + chosenRelic.hpMod
    ) {
      playerCreatureHP = playerCreature.hp + chosenRelic.hpMod;
    } else {
      playerCreatureHP =
        playerCreatureHP + playerCreatureSpecial * criticalMultiplier * 0.2;
    }
  }

  receiveEnemyCounterAttack(chancePlayer, moveName, moveType);
};

// heals player creature
const healPlayerCreature = (
  chancePlayer,
  playerCreatureSpecial,
  criticalMultiplier,
  moveName,
  moveType
) => {
  if (chancePlayer) {
    if (
      playerCreatureHP + playerCreatureSpecial * criticalMultiplier >
      playerCreature.hp + chosenRelic.hpMod
    ) {
      playerCreatureHP = playerCreature.hp + chosenRelic.hpMod;
    } else {
      playerCreatureHP =
        playerCreatureHP + playerCreatureSpecial * criticalMultiplier;
    }
  }

  receiveEnemyCounterAttack(chancePlayer, moveName, moveType);
};

// performs creature special
const performSpecial = (
  chancePlayer,
  playerCreatureSpecial,
  playerCreatureSpecialCost,
  criticalMultiplier,
  enemyDefense,
  moveName,
  moveType
) => {
  playerCreatureMP = playerCreatureMP - playerCreatureSpecialCost;

  if (moveType !== "Heal") {
    if (
      enemyCreatureHP -
        (playerCreatureSpecial - playerCreatureSpecial * enemyDefense) *
          criticalMultiplier <=
        0 &&
      chancePlayer
    ) {
      enemyCreatureHP = 0;
      combatAlert = "Victory!";
      return;
    }

    if (chancePlayer) {
      enemyCreatureHP =
        enemyCreatureHP -
        (playerCreatureSpecial - playerCreatureSpecial * enemyDefense) *
          criticalMultiplier;
    }

    checkLifesteal(
      playerCreatureSpecial,
      criticalMultiplier,
      chancePlayer,
      moveName,
      moveType
    );
    return;
  }

  healPlayerCreature(
    chancePlayer,
    playerCreatureSpecial,
    criticalMultiplier,
    moveName,
    moveType
  );
};

// initiates chance to attack enemy creature
const attackEnemyOrHeal = (moveName, moveType) => {
  try {
    const playerCreatureAttack = playerCreature.attack + chosenRelic.attackMod;
    const playerCreatureSpeed = playerCreature.speed + chosenRelic.speedMod;
    const playerCreatureCritical =
      (playerCreature.critical + chosenRelic.criticalMod) / 100;
    let playerCreatureSpecial = playerCreature.special + chosenRelic.specialMod;
    let playerCreatureSpecialCost = playerCreature.specialCost;
    let enemyDefense = enemyCreature.defense / 100;
    let chancePlayer = false;
    let criticalMultiplier = 1;

    if (moveName === playerCreature.specialName2) {
      playerCreatureSpecial = playerCreature.special2 + chosenRelic.specialMod;
      playerCreatureSpecialCost = playerCreature.specialCost2;
    }

    if (moveType === "Magic") enemyDefense = 0;

    // checks player creature speed vs enemy creature speed and sets chance
    if (playerCreatureSpeed < enemyCreature.speed) {
      chancePlayer = Math.random() >= 0.5;
    } else {
      chancePlayer = Math.random() >= 0.8;
    }

    // checks for player critical hit
    if (Math.random() <= playerCreatureCritical) criticalMultiplier = 1.5;

    if (moveType === "Poison" && criticalMultiplier === 1)
      criticalMultiplier = 1.5;

    if (moveName === playerCreature.attackName) {
      // checks for enemy death
      if (
        enemyCreatureHP -
          (playerCreatureAttack - playerCreatureAttack * enemyDefense) *
            criticalMultiplier <=
          0 &&
        chancePlayer
      ) {
        enemyCreatureHP = 0;
        combatAlert = "Victory!";
        drachmas += enemyCreature.reward;
        return;
      }

      if (chancePlayer) {
        enemyCreatureHP =
          enemyCreatureHP -
          (playerCreatureAttack - playerCreatureAttack * enemyDefense) *
            criticalMultiplier;
      }

      receiveEnemyCounterAttack(chancePlayer, moveName, moveType);
      return;
    }

    // checks to see if the player has enough mana to use special
    if (playerCreatureMP >= playerCreatureSpecialCost) {
      performSpecial(
        chancePlayer,
        playerCreatureSpecial,
        playerCreatureSpecialCost,
        criticalMultiplier,
        enemyDefense,
        moveName,
        moveType
      );
      return;
    }

    combatAlert = "Not enough MP!";
  } catch (err) {
    console.log(err);
  }
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("useskill")
    .setDescription("Attacks enemy or performs special")
    .addSubcommand((subcommand) =>
      subcommand.setName("1").setDescription("Attacks enemy")
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("2").setDescription("Performs special")
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("3").setDescription("Performs secondary special")
    ),

  async execute(interaction, client) {
    try {
      const gamesPath = path.relative(process.cwd(), "docs/games.txt");
      const userId = interaction.member.user.id;
      let re;
      let gameData;
      let formatted;

      re = new RegExp("^.*" + userId + ".*$", "gm");
      gameData = await loadGameData(gamesPath, re);

      if (gameData === undefined) {
        interaction.reply({
          content: "You must join the game first.",
          ephemeral: true,
        });
        return;
      }

      if (interaction.options.getSubcommand() === "1") {
        attackEnemyOrHeal(playerCreature.attackName, playerCreature.attackType);
      }

      if (interaction.options.getSubcommand() === "2") {
        attackEnemyOrHeal(
          playerCreature.specialName,
          playerCreature.specialType
        );
      }

      if (interaction.options.getSubcommand() === "3") {
        attackEnemyOrHeal(
          playerCreature.specialName2,
          playerCreature.specialType2
        );
      }

      formatted = gameData.replace(
        re,
        userId +
          "," +
          drachmas +
          "," +
          (playerCreature.id - 1) +
          "," +
          (chosenRelic.id - 1) +
          "," +
          playerCreatureHP +
          "," +
          playerCreatureMP +
          "," +
          (enemyCreature.id - 1) +
          "," +
          enemyCreatureHP
      );

      fs.writeFile(gamesPath, formatted, "utf8", (err) => {
        if (err) return console.error(err);

        interaction.reply({
          content:
            "**Player " +
            playerCreature.name +
            "**\nHP: " +
            playerCreatureHP +
            "\nMP: " +
            playerCreatureMP +
            "\n\n**Enemy " +
            enemyCreature.name +
            "**\nHP: " +
            enemyCreatureHP +
            "\n\n*" +
            combatAlert +
            "*",
          ephemeral: true,
        });
      });
    } catch (err) {
      console.error(err);
    }
  },
};