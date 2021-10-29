const { SnapshotInterpolation } = Snap;
const SI = new SnapshotInterpolation(30); // 30 FPS

function randomNumber(min, max) {
  if (!max) {
    max = min;
    min = 0;
  }
  return Math.floor(Math.random() * (max - min + 1) + min);
};

class MainScene extends Phaser.Scene {
  constructor() {
    super("MainScene");
  }

  init() {
    this.dudes = new Map();
    this.stars = [];
    this.starsSnapShot = [];
    this.lastStarId = [];
    this.cursors;

    this.socket = io();
    this.socket.on("connect", () => {
      console.log("id:", this.socket.id);
    });
  }

  preload() {
    this.load.image("Sky", Assets.Background.Skys.Sky);
    this.load.image("Platform", Assets.Sprites.Platforms.Platform);
    this.load.image("Star", Assets.Sprites.Star.Star);
    this.load.image("Bomb", Assets.Sprites.Bomb.Bomba);
    this.load.spritesheet("Dude", Assets.Sprites.Dude.png, Assets.Sprites.Dude.size);
  }

  create() {
    this.add.image(400, 300, "Sky");
    this.cursors = this.input.keyboard.createCursorKeys();
    this.scoreLabel = this.add.text(16, 16, "Score: 0");

    this.socket.on("createWorld", data => {
      for (let i = 0; i < data.platformsPosition.length; i++) {
        this.add.image(data.platformsPosition[i].x, data.platformsPosition[i].y, "Platform");
      }
    });

    this.socket.on("snapshot", data => {
      this.starsSnapShot = data.stars;
      SI.snapshot.add(data.snapshot);
    });

    // Update Player Name
    document.getElementById("updateName").addEventListener("click", () => {
      const playerName = prompt("Player name:", "Player") || "Player" + randomNumber(0, 1000);
      this.socket.emit("updateName", { playerName: playerName, id: this.socket.id });
    });
  }

  update() {
    const snap = SI.calcInterpolation("x y");
    if (!snap) return;

    const { state } = snap;
    if (!state) return;

    // Dudes
    const dudesID = [];
    state.forEach((dude, index) => {
      const exists = this.dudes.has(dude.id);

      if (!exists) {
        dudesID.push(dude.id);
        const _dude = this.add.sprite(dude.x, dude.y, "Dude", 4);
        _dude.labelScore = this.add.text(800, 10, `Score: ${dude.score}`).setOrigin(1, 0);
        if (this.socket.id !== dude.id) {
          _dude.setTint(0xff0000);
          _dude.setAlpha(0.75);
        }
        this.dudes.set(dude.id, { dude: _dude });
      } else {
        dudesID.push(dude.id);
        const _dude = this.dudes.get(dude.id).dude;
        _dude.setX(dude.x);
        _dude.setY(dude.y);
        _dude.labelScore.setText(`Score: ${dude.score} Player: ${dude.playerName}`);
        _dude.labelScore.setY(index * 20 + 10);
        if (this.socket.id === dude.id) this.scoreLabel.setText(`Score: ${dude.score} Player: ${dude.playerName}`);
      }
    });

    // Remove Dude
    this.dudes.forEach((dude, id) => {
      if (!dudesID.includes(id) && dude) {
        if (dude.labelScore) dude.labelScore.destroy();
        dude.dude.destroy();
        this.dudes.delete(id);
      }
    });

    // Stars
    const newStarsId = [];
    this.starsSnapShot.forEach(star => {
      if (!this.lastStarId.includes(star.id)) {
        const newStar = this.add.sprite(star.x, star.y, "Star");
        newStar.id = star.id;
        this.stars.push(newStar);
      } else {
        for (let i = 0; i < this.stars.length; i++) {
          if (this.stars[i].id === star.id) {
            this.stars[i].setX(star.x);
            this.stars[i].setY(star.y);
          }
        }

        // Remove Stars
        for (let i = 0; i < this.stars.length; i++) {
          if (!this.lastStarId.includes(this.stars[i].id)) {
            this.stars[i].destroy();
            this.stars.splice(i, 1);
            break;
          }
        }
      }
      newStarsId.push(star.id);
    });
    this.lastStarId = newStarsId;

    const movement = {
      left: this.cursors.left.isDown,
      right: this.cursors.right.isDown,
      up: this.cursors.up.isDown,
      down: this.cursors.down.isDown,
    }

    this.socket.emit("movement", movement);
  }
}

const config = {
  scale: {
    mode: Phaser.Scale.FIT,
    width: 800,
    height: 600,
  },
  scene: [MainScene],
  physics: {
    default: "arcade",
    arcade: {
      debug: false,
    },
  },
}

window.addEventListener("load", () => {
  const game = new Phaser.Game(config);
})
