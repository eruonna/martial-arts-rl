var Game = function () {

var displayOptions = {
    width: 80,
    height: 35,
    spacing: 1.001,
    forceSquareRatio: true,
};
var mapSettings = {
    width: 70,
    height: 30,
};
var dark_wall_color = "rgb(0,0,100)";
var dark_ground_color = "rgb(50,50,150)";
var light_wall_color = "rgb(130,110,50)";
var light_ground_color = "rgb(200,180,50)";
var actions = {}
actions[ROT.VK_UP] = { action: "move", dx: 0, dy: -1 };
actions[ROT.VK_DOWN] = { action: "move", dx: 0, dy: 1 };
actions[ROT.VK_LEFT] = { action: "move", dx: -1, dy: 0 };
actions[ROT.VK_RIGHT] = { action: "move", dx: 1, dy: 0 };
actions[ROT.VK_NUMPAD1] = { action: "move", dx: -1, dy: 1 };
actions[ROT.VK_NUMPAD3] = { action: "move", dx: 1, dy: 1 };
actions[ROT.VK_NUMPAD7] = { action: "move", dx: -1, dy: -1 };
actions[ROT.VK_NUMPAD9] = { action: "move", dx: 1, dy: -1 };
actions[ROT.VK_H] = actions[ROT.VK_LEFT];
actions[ROT.VK_J] = actions[ROT.VK_DOWN];
actions[ROT.VK_K] = actions[ROT.VK_UP];
actions[ROT.VK_L] = actions[ROT.VK_RIGHT];
actions[ROT.VK_Y] = actions[ROT.VK_NUMPAD7];
actions[ROT.VK_U] = actions[ROT.VK_NUMPAD9];
actions[ROT.VK_B] = actions[ROT.VK_NUMPAD1];
actions[ROT.VK_N] = actions[ROT.VK_NUMPAD3];
actions[ROT.VK_PERIOD] = { action: "wait" };

var display = null;

var Entity = function(components) {
    for (var c in components) {
        this[c] = components[c];
        this[c].entity = this;
    }
};

var Tile = function(blocked, blockSight) {
    this.blocked = blocked;
    this.blockSight = blockSight;
    this.visible = false;
}

var Map = function(game, settings) {
    this.game = game;
    settings = settings || mapSettings;
    this.width = settings.width;
    this.height = settings.height;
    this.tiles = []
    for (var x = 0; x < this.width; x++) {
        this.tiles[x] = [];
        for (var y = 0; y < this.height; y++) {
            this.tiles[x][y] = new Tile(true, true);
        }
    }
};

Map.prototype.get = function(x,y) {
    var r = this.tiles[x];
    return r && r[y];
};

Map.prototype.draw = function() {
    for (var x = 0; x < this.width; x++) {
        for (var y = 0; y < this.height; y++) {
            if (this.tiles[x][y].blocked) {
                this.game.display.draw(x,y," ","",light_wall_color);
            } else {
                this.game.display.draw(x,y," ","",light_ground_color);
            }
        }
    }
};

Map.prototype.generate = function() {
    var gen = new ROT.Map.Arena(this.width, this.height);
    var dig = function(x, y, value) {
        this.tiles[x][y].blocked = value == 1;
    };
    gen.create(dig.bind(this));
};

Map.prototype.computeDistance = function(x,y) {
    for (var mx = 0; mx < this.width; mx++) {
        for (var my = 0; my < this.height; my++) {
            this.tiles[mx][my].distance = false;
        }
    }

    var q = [[x, y, 0]];

    while (q.length) {
        var p = q.shift(),
            t = this.get(p[0], p[1]);

        if (t && !t.blocked && (t.distance === false || p[2] < t.distance)) {
            t.distance = p[2];
            var d = p[2] + 1;
            q.push([p[0]-1,p[1]-1,d],[p[0],p[1]-1,d],[p[0]+1,p[1]-1,d],
                   [p[0]-1,p[1],d],                  [p[0]+1,p[1],d],
                   [p[0]-1,p[1]+1,d],[p[0],p[1]+1,d],[p[0]+1,p[1]+1,d]);
        }
    }
};

Map.prototype.blocked = function(x, y) {
    var t = this.get(x,y);
    if (!t || t.blocked) { return true; }

    for (o of this.game.components.object) {
        if (o.x == x && o.y == y) {
            return o.blocks;
        }
    }
};

var Game = function() {
    this.entities = [];
    this.components = {};
    this.scheduler = new ROT.Scheduler.Action();
    this.engine = new ROT.Engine(this.scheduler);
    this.display = new ROT.Display(displayOptions);
    document.body.appendChild(this.display.getContainer());
    this.map = new Map(this);
    this.map.generate();
    this.player =
        new Entity({ object: new Item(35, 12, "@", "black", "white", true)
                   , ai: playerController });
    this.map.computeDistance(this.player.object.x, this.player.object.y);
    var enemy =
        new Entity({ object: new Item(1, 1, "n", "white", "black", true)
                   , ai: new BasicAI(11) });
    this.addEntity(this.player);
    this.addEntity(enemy);
    this.draw();
    this.engine.start();
};

Game.prototype.addEntity = function(e) {
    e.game = this;
    this.entities.push(e);
    for (var c in e) {
        if (this.components[c]) {
            this.components[c].push(e[c]);
        } else {
            this.components[c] = [e[c]];
        }
    }
    if (e.ai) {
        this.scheduler.add(e.ai, true);
    }
};

Game.prototype.draw = function() {
    this.display.clear();
    this.map.draw();
    for (var o of this.components.object) {
        o.draw();
    }
};

Game.prototype.handleEvent = function(ev) {
    var code = ev.keyCode;

    if (!(code in actions)) { return; }

    var action = actions[code];
    var acted = false;

    switch (action.action) {
        case "move":
            if (this.player.object.moveRelative(action.dx, action.dy)) {
                acted = true;
                this.scheduler.setDuration(10);
            }
            break;
        case "wait":
            acted = true;
            this.scheduler.setDuration(10);
            break;
        default:
            break;
    }

    if (acted) {
        this.draw();
        this.map.computeDistance(this.player.object.x, this.player.object.y);
        this.engine.unlock();
    }
};

var Item = function(x, y, symbol, fg, bg, blocks) {
    this.x = x;
    this.y = y;
    this.symbol = symbol;
    this.fg = fg || "white";
    this.bg = bg || "black";
    this.blocks = blocks || false;
};

Item.prototype.draw = function() {
    this.entity.game.display.draw(this.x, this.y, this.symbol, this.fg, this.bg);
};

Item.prototype.moveRelative = function(dx, dy) {
    var newX = this.x + dx, newY = this.y + dy;
    return this.move(newX, newY);
};

Item.prototype.move = function(newX, newY) {
    var map = this.entity.game.map;
    if (map.blocked(newX, newY)) { return false; }
    this.x = newX;
    this.y = newY;
    return true;
};

var Fighter = function(hp, attack, defense, speed) {
    this.hp = hp;
    this.max_hp = hp;
    this.attack = attack || 1;
    this.defense = defense || 0;
    this.speed = speed || 10;
};

var BasicAI = function(moveSpeed) {
    this.moveSpeed = moveSpeed || 10;
};

BasicAI.prototype.act = function() {
    var map = this.entity.game.map;
    var object = this.entity.object;

    var dist = map.get(object.x, object.y).distance;
    var neighbors = [[object.x-1, object.y-1],[object.x,object.y-1],[object.x+1,object.y-1],
                     [object.x-1, object.y],                        [object.x+1,object.y],
                     [object.x-1, object.y+1],[object.x,object.y+1],[object.x+1,object.y+1]];
    var move = false;
    for (var p of neighbors) {
        var t = map.get(p[0], p[1]);
        if (!map.blocked(p[0], p[1]) && t && t.distance !== false && t.distance < dist) {
            dist = t.distance;
            move = p;
        }
    }

    if (move) {
        object.move(move[0], move[1]);
        this.entity.game.scheduler.setDuration(this.moveSpeed);
    }
};

var playerController = {
    act: function() {
        this.entity.game.draw();
        this.entity.game.engine.lock();
        window.addEventListener("keydown", this.entity.game);
    },
};

var run = function () {
    var game = new Game();
}

return { run: run };

}();
