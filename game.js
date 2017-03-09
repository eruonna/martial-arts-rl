var Game = function () {

var MAX_MESSAGE_LENGTH = 75;

var displayOptions = {
    width: 80,
    height: 35,
    viewport: { width: 60, height: 30 },
    spacing: 1.001,
    forceSquareRatio: true,
};
var mapSettings = {
    width: 60,
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

var Message = function(msg) {
    this.v2 = msg.v;
    this.v3s = msg.v3s || (msg.v + "s");
    this.v3p = msg.v3s || msg.v;
    this.mid = msg.mid || "";
    this.tail = msg.tail || "";
};

var msgHits = new Message({
    v: "hit"
});

var msgMiss = new Message({
    v: "miss",
    v3s: "misses"
});

var msgWallJump = new Message({
    v: "spring",
    tail: " off the wall"
});

var msgDie = new Message({
    v: "die",
    v3s: "dies"
});

var msgLunge = new Message({
    v: "lunge",
    mid: " at"
});

var Entity = function(components) {
    for (var c in components) {
        this[c] = components[c];
        this[c].entity = this;
    }
};

Entity.prototype.addComponent = function(c, comp) {
    if (this[c]) { this.removeComponent(c); }

    this[c] = comp;
    comp.entity = this;
    if (this.game) { this.game.components[c].push(comp); }
};

Entity.prototype.removeComponent = function(c) {
    var comp = this[c];

    delete this[c];

    if (this.game) {
        var i = this.game.components[c].indexOf(comp);
        if (i >= 0) {
            if (c === 'ai') { this.game.scheduler.remove(comp); }
            this.game.components[c].splice(i,1);
        }
    }
};

var Attack = function(props) {
    this.power = props.power;
    this.accuracy = props.accuracy;
    this.speed = props.speed;
    this.msgHits = props.msgHits || msgHits;
    this.msgMiss = props.msgMiss || msgMiss;
    this.msgAttempt = props.msgAttempt;
};

Attack.prototype.hits = function(target) {
    var chance = 1 / (1 + Math.pow(2, this.accuracy - target.fighter.defense));
    return ROT.RNG.getUniform() < chance;
};

Attack.prototype.doAttack = function(target) {
    var damage = this.power - Math.floor(ROT.RNG.getUniform()*target.fighter.defense);
    this.fighter.entity.game.scheduler.setDuration(this.speed);
    var sayTarget = target.object;

    if (this.msgAttempt) {
        this.fighter.entity.game.say(this.msgAttempt,
                                     this.fighter.entity.object,
                                     sayTarget);
        sayTarget = undefined;
    }

    if (this.hits(target) && damage > 0) {
        this.fighter.entity.game.say(this.msgHits,
                                     this.fighter.entity.object,
                                     sayTarget);
        target.fighter.takeDamage(damage);
        return true;
    } else {
        this.fighter.entity.game.say(this.msgMiss,
                                     this.fighter.entity.object,
                                     sayTarget);
        return false;
    }
};

Attack.prototype.attack = function(target) {
    this.doAttack(target);
};

var Fighter = function(hp, attacks, defense) {
    this.hp = hp;
    this.maxHp = hp;
    this.attacks = attacks;
    for (var a in attacks) {
        attacks[a].fighter = this;
    }
    this.defense = defense || 0;
};

Fighter.prototype.takeDamage = function (damage) {
    this.hp -= damage;
    if (this.hp <= 0) { this.die(); }
};

Fighter.prototype.attack = function (type, target) {
    if (this.attacks[type]) {
        return this.attacks[type].attack(target);
    }
    return false;
};

Fighter.prototype.wallJump = function(dx, dy) {
    var newX = this.entity.location.x - 2*dx, newY = this.entity.location.y - 2*dy;
    if (this.entity.location.move(newX, newY)) {
        this.entity.game.say(msgWallJump, this.entity.object);
        this.entity.game.scheduler.setDuration(this.speed);
        return true;
    } else {
        this.entity.game.tellPlayer("No room to wall jump.", this);
        return false;
    }
};

var corpse = function(o) {
    return { symbol: "%"
           , fg: "grey"
           , bg: "rgb(96,16,0)"
           , blocks: false
           , name: o.name + " corpse"
           };
};

Fighter.prototype.die = function() {
    var game = this.entity.game;
    game.say(msgDie, this.entity.object);
    var x = this.entity.location.x, y = this.entity.location.y;
    var c = new Entity({object: new Item(corpse(this.entity.object))
                       ,location: new Location(x,y)});
    game.removeEntity(this.entity);
    game.addEntity(c);
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

Map.prototype.draw = function(cx, cy) {
    var width = displayOptions.viewport.width,
        height = displayOptions.viewport.height,
        offx = cx - Math.floor(width / 2),
        offy = cy - Math.floor(height / 2);
    for (var x = 0; x < width; x++) {
        for (var y = 0; y < height; y++) {
            var t = this.get(x+offx,y+offy);
            if (!t || t.blocked) {
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

    for (o of this.game.components.location) {
        if (o.x == x && o.y == y && o.entity.object) {
            return o.entity.object.blocks;
        }
    }
};

var playerProps =
    { symbol: "@"
    , fg: "black"
    , bg: "white"
    , blocks: true
    , name: "you"
    };

var playerBaseAttack =
    { power: 2
    , accuracy: 1
    , speed: 10
    };

var playerLungeAttack =
    { power: 4
    , accuracy: 1
    , speed: 10
    , msgAttempt: msgLunge
    };

var playerFighter = new Fighter(
    30,
    { base: new Attack(playerBaseAttack),
      lunge: new Attack(playerLungeAttack) },
    5);

var ninja =
    { symbol: "n"
    , fg: "white"
    , bg: "black"
    , blocks: true
    , name: "ninja"
    };

var ninjaBaseAttack =
    { power: 1
    , accuracy: 1
    , speed: 10
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
        new Entity({ object: new Item(playerProps)
                   , location: new Location(30, 12)
                   , ai: playerController
                   , fighter: playerFighter });
    this.map.computeDistance(this.player.location.x, this.player.location.y);
    var enemy =
        new Entity({ object: new Item(ninja)
                   , location: new Location(1,1)
                   , ai: new BasicAI(10)
                   , fighter: new Fighter(5, { base: new Attack(ninjaBaseAttack) }, 1) });
    this.addEntity(this.player);
    this.addEntity(enemy);
    enemy = new Entity({ object: new Item(ninja)
                       , location: new Location(55,2)
                       , ai: new BasicAI(10)
                       , fighter: new Fighter(5, { base: new Attack(ninjaBaseAttack) }, 1) });
    this.addEntity(enemy);
    this.messages = ["Welcome to the dojo."];
    this.message = "";
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

Game.prototype.removeEntity = function(e) {
    for (var c in e) {
        e.removeComponent(c);
    }
    e.game = null;
    var i = this.entities.indexOf(e);
    if (i >= 0) {
        this.entities.splice(i,1);
    }
};

Game.prototype.showStats = function() {
    var hp = this.player.fighter.hp, maxHp = this.player.fighter.maxHp;
    this.display.drawText(displayOptions.viewport.width, 0, "HP: " + hp + "/" + maxHp);
};

Game.prototype.drawChar = function(mx, my, sym, fg, bg) {
    var cx = this.player.location.x,
        cy = this.player.location.y,
        width = displayOptions.viewport.width,
        height = displayOptions.viewport.height,
        offx = cx - Math.floor(width / 2),
        offy = cy - Math.floor(height / 2);
    this.display.draw(mx - offx, my - offy, sym, fg, bg);
};

Game.prototype.draw = function() {
    this.breakMessage();
    this.display.clear();
    this.map.draw(this.player.location.x, this.player.location.y);
    for (var o of this.components.object) {
        o.draw();
    }
    for (var o of this.components.object) {
        if (o.blocks) {
            o.draw();
        }
    }
    this.showStats();
    var line = displayOptions.viewport.height;
    for (var m of this.messages.slice(-5)) {
        this.display.drawText(0, line, m);
        line++;
    }
};

Game.prototype.getEntitiesAt = function(x, y) {
    var results = [];
    for (var o of this.components.location) {
        if (o.x === x && o.y === y) {
            results.push(o.entity);
        }
    }
    return results;
};

Game.prototype.breakMessage = function() {
    if (this.message.length) {
        this.messages.push(this.message);
        this.message = "";
    }
};

Game.prototype.addMessage = function(msg) {
    if (this.message.length + msg.length >= MAX_MESSAGE_LENGTH) {
        this.breakMessage();
    }
    this.message += " " + msg;
}

Game.prototype.say = function(message, subject, object) {
    var msg = "", sub = "", verb = "", ob = " ";
    if (subject.entity === this.player) {
        sub = "You";
        verb = message.v2;
    } else {
        if (!subject.properName) {
            sub = "The ";
        }
        sub += subject.name;
        if (subject.isPlural) {
            verb = message.v3p;
        } else {
            verb = message.v3s;
        }
    }
    msg = sub + " " + verb + message.mid;
    if (object) {
        if (object.entity === this.player) {
            ob += "you";
        } else {
            if (!object.properName) {
                ob += "the ";
            }
            ob += object.name;
        }
        msg += ob;
    }
    msg += message.tail + ".";
    this.addMessage(msg);
};

Game.prototype.tellPlayer = function(msg, subject) {
    if (subject.entity === this.player) {
        this.addMessage(msg);
    }
};

Game.prototype.playerMoveOrFight = function(dx, dy) {
    var newX = this.player.location.x + dx, newY = this.player.location.y + dy;

    if (!this.player.location.move(newX, newY)) {
        var blockers = this.getEntitiesAt(newX, newY);
        if (blockers.length) {
            for (var blocker of blockers) {
                if (blocker && blocker.fighter) {
                    this.player.fighter.attack("base", blocker);
                    return true;
                }
            }
        } else {
            return this.player.fighter.wallJump(dx,dy);
        }
    }
    // Player moved
    var lx = newX + dx, ly = newY + dy;
    var targets = this.getEntitiesAt(lx, ly);
    for (var target of targets) {
        if (target.fighter) {
            this.player.fighter.attack("lunge", target);
        }
    }

    var os = this.getEntitiesAt(newX, newY).filter(function(e) {
        return e !== this.player; }, this).map(function(e) {
        return e.object.name; });
    var groups = {};
    for (var o of os) {
        if (groups[o]) {
            groups[o]+=1;
        } else {
            groups[o]=1;
        }
    }
    os = []
    for (var o in groups) {
        if (groups[o] == 1) {
            os.push("a " + o);
        } else {
            os.push(groups[o] + " " + o + "s");
        }
    }
    var l = os.length;
    for (var i = 0; i < l; i++) {
        var msg = "";
        if (i == 0) { msg += "You see here "; }
        else if (i == l-1) { msg += "and "; }
        msg += os[i];
        if (i == l-1) { msg += "."; }
        else { msg += ","; }
        this.addMessage(msg);
    }
    this.scheduler.setDuration(this.player.ai.moveSpeed);
    return true;
};

Game.prototype.handleEvent = function(ev) {
    var code = ev.keyCode;

    if (!(code in actions)) { return; }

    var action = actions[code];
    var acted = false;

    switch (action.action) {
        case "move":
            acted = this.playerMoveOrFight(action.dx, action.dy);
            break;
        case "wait":
            acted = true;
            this.scheduler.setDuration(10);
            break;
        default:
            break;
    }

    this.draw();

    if (acted) {
        this.map.computeDistance(this.player.location.x, this.player.location.y);
        this.engine.unlock();
    }
};

var Location = function(x, y) {
    this.x = x;
    this.y = y;
};

Location.prototype.moveRelative = function(dx, dy) {
    var newX = this.x + dx, newY = this.y + dy;
    return this.move(newX, newY);
};

Location.prototype.move = function(newX, newY) {
    var map = this.entity.game.map;
    if (map.blocked(newX, newY)) { return false; }
    this.x = newX;
    this.y = newY;
    return true;
};

var Item = function(properties) {
    this.symbol = properties.symbol;
    this.fg = properties.fg || "white";
    this.bg = properties.bg || "black";
    this.blocks = properties.blocks || false;
    this.name = properties.name;
};

Item.prototype.draw = function() {
    if (this.entity.location) {
        var x = this.entity.location.x, y = this.entity.location.y;
        this.entity.game.drawChar(x, y, this.symbol, this.fg, this.bg);
    }
};

var BasicAI = function(moveSpeed) {
    this.moveSpeed = moveSpeed || 10;
};

BasicAI.prototype.moveToward = function() {
    var map = this.entity.game.map;
    var loc = this.entity.location;

    var dist = map.get(loc.x, loc.y).distance;
    var neighbors = [[loc.x-1, loc.y-1],[loc.x,loc.y-1],[loc.x+1,loc.y-1],
                     [loc.x-1, loc.y],                  [loc.x+1,loc.y],
                     [loc.x-1, loc.y+1],[loc.x,loc.y+1],[loc.x+1,loc.y+1]].randomize();
    var move = false;
    for (var p of neighbors) {
        var t = map.get(p[0], p[1]);
        if (!map.blocked(p[0], p[1]) && t && t.distance !== false && t.distance < dist) {
            dist = t.distance;
            move = p;
        }
    }

    return move;
};

BasicAI.prototype.act = function() {
    var map = this.entity.game.map;
    var loc = this.entity.location;

    var dist = map.get(loc.x, loc.y).distance;

    if (dist > 1) {
        var move = this.moveToward();

        if (move) {
            loc.move(move[0], move[1]);
            this.entity.game.scheduler.setDuration(this.moveSpeed);
        }
    } else {
        var fighter = this.entity.fighter;

        if (fighter) {
            fighter.attack("base", this.entity.game.player);
        }
    }
};

var playerController = {
    act: function() {
        this.entity.game.draw();
        this.entity.game.engine.lock();
        window.addEventListener("keydown", this.entity.game);
    },
    moveSpeed: 10,
};

var run = function () {
    var game = new Game();
}

return { run: run };

}();
