// imports for server
const express = require("express");
const app = express();
const server = require("http").createServer(app);
const io = require("socket.io")(server);
const path = require("path");

// imports for  phaser
require("@geckos.io/phaser-on-nodejs");
const { SnapshotInterpolation } = require("@geckos.io/snapshot-interpolation");
const SI = new SnapshotInterpolation();
const Phaser = require("phaser");
const { runInThisContext } = require("vm");

class Platform extends Phaser.Physics.Arcade.Sprite {
	constructor(scene, x, y) {
		super(scene, x, y, "");

		scene.add.existing(this);
		scene.physics.add.existing(this);

		this.body.setSize(400, 32);
		this.body.setMaxVelocity(0);
		this.setImmovable(true);
		this.setCollideWorldBounds(true);
	}
}

class Dude extends Phaser.Physics.Arcade.Sprite {
	constructor(scene, x, y) {
		super(scene, x, y, "");

		this.score = 0;
		this.socketId = "";
		this.playerName = "Player";
		this.movement = {};

		scene.add.existing(this);
		scene.physics.add.existing(this);

		this.body.setSize(32, 48);
		this.setCollideWorldBounds(true);
	}
}

class Star extends Phaser.Physics.Arcade.Sprite {
	constructor(scene, x, y) {
		super(scene, x, y, "");

		this.id = Math.random();

		scene.add.existing(this);
		scene.physics.add.existing(this);

		this.body.setSize(24, 22);
		this.setCollideWorldBounds(true);
		this.setBounce(0.999);
		this.setRandomPosition(0, 0, scene.game.config.width, scene.game.config.height);
		this.setVelocity(Phaser.Math.Between(-200, 200), Phaser.Math.Between(-200, 200));
	}
}
class Bomb extends Phaser.Physics.Arcade.Sprite {
	constructor(scene, x, y) {
		super(scene, x, y, "");

		this.id = Math.random();

		scene.add.existing(this);
		scene.physics.add.existing(this);

		this.body.setSize(14, 14);
		this.setCollideWorldBounds(true);
		this.setBounce(1);
		this.setRandomPosition(0, 0, scene.game.config.width, scene.game.config.height);
		this.setVelocity(Phaser.Math.Between(-200, 200), Phaser.Math.Between(-200, 200));
	}
}

class ServerScene extends Phaser.Scene {
	constructor() {
		super();
		this.tick = 0;
		this.players = new Map();
		this.platforms = [];
		this.stars = [];
		this.bombs = [];

		this.mainsSocket = null;
	}

	create() {
		this.physics.world.setBounds(0, 0, 800, 600);

		setInterval(() => { this.createNewStar() }, 1000);

		// Create Platforms
		this.platforms.push(new Platform(this, 200, 350));
		this.platforms.push(new Platform(this, 400, 200));
		this.platforms.push(new Platform(this, 400, 500));

		const platformsPosition = [];
		this.platforms.forEach(platform => {
			platformsPosition.push({ x: platform.x, y: platform.y });
		});

		io.on("connection", socket => {
			this.mainsSocket = socket;

			// Phaser Objects
			const x = Math.random() * 800 + 20;
			const dude = new Dude(this, x, 200);
			dude.socketId = socket.id;
			this.players.set(socket.id, { socket, dude: dude, });

			this.physics.add.collider(dude, this.platforms);

			const bomb = new Bomb(this, 0, 0);
			for (let i = 0; i < this.platforms.length; i++) { // Platform Collisions
				this.physics.add.collider(bomb, this.platforms[i]);
			}
			for (let i = 0; i < this.stars.length; i++) { // Star Collisions
				this.physics.add.collider(bomb, this.stars[i]);
			}
			for (let i = 0; i < this.bombs.length; i++) { // Bomb Collisions
				this.physics.add.collider(bomb, this.bombs[i]);
			}
			this.players.forEach(player => { // Player Collisions
				this.physics.add.collider(bomb, player.dude, () => { dude.score--; });
			});
			this.bombs.push(bomb);

			this.physics.add.collider(dude, this.bombs, () => { dude.score--; });


			// Socket Events
			socket.on("gameReady", data => {
				socket.emit("createWorld", { platformsPosition: platformsPosition, });
			});

			socket.on("updateName", (data) => {
				dude.playerName = data.playerName;
			});

			socket.on("movement", movement => {
				const { left, right, up, down } = movement;
				const speed = 200;
				const jump = 400;

				dude.movement = {
					left: left,
					right: right,
				};
				if (left) dude.setVelocityX(-speed);
				else if (right) dude.setVelocityX(speed);
				else dude.setVelocityX(0);
				if (up && (dude.body.touching.down || dude.body.onFloor())) dude.setVelocityY(-jump);
			})

			socket.on("disconnect", reason => {
				// Destroy Player
				const player = this.players.get(socket.id);
				player.dude.destroy();
				this.players.delete(socket.id);

				// Destroy Bomb
				for (let i = 0; i < this.bombs.length; i++) {
					if (this.bombs[i].id === bomb.id) this.bombs.splice(i, 1);
				}
				bomb.destroy();
			});
		});
	}

	createNewStar() {
		const newStar = new Star(this, 400, 50);
		let isDestroyed = false;

		// Add Collisions
		for (let i = 0; i < this.platforms.length; i++) { // Platform Collisions
			this.physics.add.collider(newStar, this.platforms[i]);
		}
		for (let i = 0; i < this.stars.length; i++) { // Star Collisions
			this.physics.add.collider(newStar, this.stars[i]);
		}
		for (let i = 0; i < this.bombs.length; i++) { // Bomb Collisions
			this.physics.add.collider(newStar, this.bombs[i]);
		}

		// Destroy Star
		this.players.forEach(player => { // Player Collisions
			const { dude } = player;
			this.physics.add.collider(newStar, dude, () => {
				dude.score++;
				this.destroyStar(isDestroyed, newStar);
			});
		});
		setTimeout(() => { this.destroyStar(isDestroyed, newStar); }, 5000);

		this.stars.push(newStar);
	}

	destroyStar(isDestroyed, newStar) {
		if (isDestroyed) return;
		isDestroyed = true;

		const starId = newStar.id;
		for (let i = 0; i < this.stars.length; i++) {
			if (this.stars[i].id === starId) this.stars.splice(i, 1);
		}
		newStar.destroy();
	}

	update() {
		this.tick++;

		// only send the update to the client at 30 FPS (save bandwidth)
		if (this.tick % 2 !== 0) return;

		// get an array of all dudes
		const dudes = [];
		this.players.forEach(player => {
			const { socket, dude } = player;
			dudes.push({ id: socket.id, x: dude.x, y: dude.y, score: dude.score, playerName: dude.playerName, movement: dude.movement });
		});

		const stars = [];
		this.stars.forEach(star => {
			stars.push({ id: star.id, x: star.x, y: star.y });
		});

		const bombs = [];
		this.bombs.forEach(bomb => {
			bombs.push({ id: bomb.id, x: bomb.x, y: bomb.y });
		});

		const snapshot = SI.snapshot.create(dudes);

		// send all dudes to all players
		this.players.forEach(player => {
			const { socket } = player;
			socket.emit("snapshot", { snapshot, stars, bombs });
		});
	}
}

const config = {
	type: Phaser.HEADLESS,
	width: 800,
	height: 600,
	banner: false,
	audio: false,
	physics: {
		default: "arcade",
		arcade: {
			gravity: { y: 300 },
		}
	},
	scene: [ServerScene],
}

const game = new Phaser.Game(config);

app.use("/", express.static(path.join(__dirname, "../client")));


const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
	console.log("Porta: " + PORT);
	console.log(`http://localhost:${PORT}/`);
});
