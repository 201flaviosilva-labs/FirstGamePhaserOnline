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
    this.playerName = "Player" + randomNumber(0, 1000);
    this.dudes = new Map();

    this.stars = [];
    this.starsSnapShot = [];
    this.lastStarsId = [];

    this.bombs = [];
    this.bombsSnapShot = [];
    this.lastBombsId = [];

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

    // Animations
    this.anims.create({
      key: "left",
      frames: this.anims.generateFrameNumbers("Dude", {
        start: 0,
        end: 3,
      }),
      frameRate: 10,
      repeat: -1,
    });
    this.anims.create({
      key: "turn",
      frames: [{
        key: "Dude",
        frame: 4,
      }],
      frameRate: 20,
    });
    this.anims.create({
      key: "right",
      frames: this.anims.generateFrameNumbers("Dude", {
        start: 5,
        end: 8,
      }),
      frameRate: 10,
      repeat: -1,
    });

    // Socket Events

    this.socket.on("createWorld", data => {
      for (let i = 0; i < data.platformsPosition.length; i++) {
        this.add.image(data.platformsPosition[i].x, data.platformsPosition[i].y, "Platform");
      }
    });

    this.socket.on("snapshot", data => {
      this.starsSnapShot = data.stars;
      this.bombsSnapShot = data.bombs;
      SI.snapshot.add(data.snapshot);
    });

    // Update Player Name
    document.getElementById("updateName").addEventListener("click", () => this.updateName());
    this.updateName();

    this.socket.emit("gameReady");
  }

  updateName() {
    Swal.fire({
      title: "Player Name:",
      input: "text",
      inputValue: this.playerName,
      showCancelButton: true,
      showLoaderOnConfirm: true,
    }).then(result => {
      this.playerName = result.value || this.playerName;
      this.socket.emit("updateName", { playerName: this.playerName, id: this.socket.id });
    });
  }

  update() {
    const snap = SI.calcInterpolation("x y");
    if (!snap) return;

    const { state } = snap;
    if (!state) return;

    // Dudes
    const dudesID = [];
    let thisPlayer = null;
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
        if (this.socket.id === dude.id) {
          this.scoreLabel.setText(`Score: ${dude.score} Player: ${dude.playerName}`);
          thisPlayer = _dude;
        }

        // Animations
        if (dude.movement) {
          if (dude.movement.left) _dude.anims.play("left", true);
          else if (dude.movement.right) _dude.anims.play("right", true);
          else _dude.anims.play("turn");
        }
      }
    });

    // Remove Dude
    this.dudes.forEach((dude, id) => {
      if (!dudesID.includes(id) && dude && dude.dude) {
        if (dude.dude.labelScore) dude.dude.labelScore.destroy();
        dude.dude.destroy();
        this.dudes.delete(id);
      }
    });

    // Stars
    const newStarsId = [];
    this.starsSnapShot.forEach(star => {
      if (!this.lastStarsId.includes(star.id)) {
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
          if (!this.lastStarsId.includes(this.stars[i].id)) {
            this.stars[i].destroy();
            this.stars.splice(i, 1);
            break;
          }
        }
      }
      newStarsId.push(star.id);
    });
    this.lastStarsId = newStarsId;

    // Bombs
    const newBombsId = [];
    this.bombsSnapShot.forEach(bomb => {
      if (!this.lastBombsId.includes(bomb.id)) {
        const newBomb = this.add.sprite(bomb.x, bomb.y, "Bomb");
        newBomb.id = bomb.id;
        this.bombs.push(newBomb);
      } else {
        for (let i = 0; i < this.bombs.length; i++) {
          if (this.bombs[i].id === bomb.id) {
            this.bombs[i].setX(bomb.x);
            this.bombs[i].setY(bomb.y);
          }
        }

        // Remove Bombs
        for (let i = 0; i < this.bombs.length; i++) {
          if (!this.lastBombsId.includes(this.bombs[i].id)) {
            this.bombs[i].destroy();
            this.bombs.splice(i, 1);
            break;
          }
        }
      }
      newBombsId.push(bomb.id);
    });
    this.lastBombsId = newBombsId;

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
  width: 800,
  height: 600,
  parent: "game-container",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: "arcade",
    arcade: {
      debug: false,
    },
  },
  scene: [MainScene],
}

window.addEventListener("load", () => {
  const game = new Phaser.Game(config);
})
