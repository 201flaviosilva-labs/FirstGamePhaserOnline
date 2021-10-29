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

class Dude extends Phaser.Physics.Arcade.Sprite {
	constructor(scene, x, y) {
		super(scene, x, y, "");

		this.score = 0;
		this.socketId = "";
		this.playerName = "Player";

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

class ServerScene extends Phaser.Scene {
	constructor() {
		super();
		this.tick = 0;
		this.players = new Map();
		this.platforms = [];
		this.stars = [];

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

			const x = Math.random() * 800 + 20;
			const dude = new Dude(this, x, 200);
			dude.socketId = socket.id;

			setTimeout(() => { this.mainsSocket.emit("createWorld", { platformsPosition: platformsPosition, }); }, 1000);
			this.physics.add.collider(dude, this.platforms);

			this.players.set(socket.id, { socket, dude: dude, });

			socket.on("updateName", (data) => {
				dude.playerName = data.playerName;
			});

			socket.on("movement", movement => {
				const { left, right, up, down } = movement;
				const speed = 200;
				const jump = 400;

				if (left) dude.setVelocityX(-speed);
				else if (right) dude.setVelocityX(speed);
				else dude.setVelocityX(0);
				if (up && (dude.body.touching.down || dude.body.onFloor())) dude.setVelocityY(-jump);
			})

			socket.on("disconnect", reason => {
				const player = this.players.get(socket.id);
				player.dude.destroy();
				this.players.delete(socket.id);
			});
		});
	}

	createNewStar() {
		const newStar = new Star(this, 400, 50);
		let isDestroyed = false;

		// Add Collisions
		for (let i = 0; i < this.platforms.length; i++) {
			this.physics.add.collider(newStar, this.platforms[i]);
		}
		for (let i = 0; i < this.stars.length; i++) {
			this.physics.add.collider(newStar, this.stars[i]);
		}

		// Destroy Star
		this.players.forEach(player => {
			const { dude } = player;
			this.physics.add.overlap(newStar, dude, () => {
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
			dudes.push({ id: socket.id, x: dude.x, y: dude.y, score: dude.score, playerName: dude.playerName });
		});

		const stars = [];
		this.stars.forEach(star => {
			stars.push({ id: star.id, x: star.x, y: star.y });
		});

		const snapshot = SI.snapshot.create(dudes);

		// send all dudes to all players
		this.players.forEach(player => {
			const { socket } = player;
			socket.emit("snapshot", { snapshot, stars });
		})
	}
}

const config = {
	type: Phaser.HEADLESS,
	width: 800,
	height: 600,
	banner: false,
	audio: false,
	scene: [ServerScene],
	physics: {
		default: "arcade",
		arcade: {
			gravity: { y: 300. },
		}
	}
}

const game = new Phaser.Game(config);

app.use("/", express.static(path.join(__dirname, "../client")));


const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
	console.log("Porta: " + PORT);
	console.log(`http://localhost:${PORT}/`);
});
