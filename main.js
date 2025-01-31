//Lookup table for converting Component Prefixes to Exponents
SI_PRE_LUT = {
    M: 6,
    K: 3,
    k: 3,
    m: -3,
    R: 0, //not actually a prefix, but for 220R notation
    u: -6,
    n: -9,
    p: -12,
};
//Prefixes for formatting
SI_PRE_SYMBS = "GMk mµnp";
Math.LN3 = Math.log(3);

/* Valid Formats
9900
9.9K
9K9
*/

function parseValue(val) {
    val = val.replace(",", ".");
    symbols = val.split(/([a-zA-Z]+)/);

    invalid = () => {
        console.error("Parsing invalid value", val);
    };

    if (symbols.length > 3) {
        invalid();
        return;
    }

    r = NaN;

    if (symbols.length == 1) r = new sciVal(parseFloat(symbols[0]), 0);
    else if (symbols[2] == "")
        r = new sciVal(parseFloat(symbols[0]), SI_PRE_LUT[symbols[1]]);
    else
        r = new sciVal(
            parseInt(symbols[0]) + parseInt(symbols[2]) / 10,
            SI_PRE_LUT[symbols[1]]
        );
    if (!r) {
        invalid();
        return;
    }
    return r;
}

let resistors = [];
let capacitors = [];

function loadFromText(r) {
    resistors = [];
    capacitors = [];
    let RorC = 0;
    for (let line of r.split("\n")) {
        line = line.trim();
        if (line == "") continue;
        if (["/R", "/C"].includes(line)) {
            RorC = line == "/R" ? 0 : 1;
            continue;
        }
        let val = parseValue(line);
        [resistors, capacitors][RorC].push(val);
    }
    console.log("Done loading file");
    fillInputs();
}

let filledOut = 0;
let oscParams = {};
let paramNames = {};
let labels = document.getElementsByTagName("label");
for (let l of labels) {
    paramNames[l.htmlFor.slice(3)] = l.innerHTML.trim();
}
let paramIDs;
let unitIDs;
let unitSymbs = {
    Freq: "Hz",
    Prop: "%",
    Time: "s",
};

let fullIDs = ["Freq", "Duty", "Period", "TLow", "THigh"];

fullIDs.forEach((id) => {
    let elem = document.getElementById("inp" + id);
    elem.oninput = paramUpdate;
    //elem.onchange = paramUpdate;
});

let results;
let nextListing = 0;
const listPerClick = 10;
let bufferSize = 100;
let driving = {};
let drivingKeys = [];

var astable;
var modeSelect = document.getElementById("modeSelect");
modeSelect.onchange = () => {
    astable = modeSelect.value == "astable";
    document.body.classList.toggle("mode-astable", astable);
    document.body.classList.toggle("mode-mstable", !astable);
    if (astable) {
        paramIDs = fullIDs;
        unitIDs = ["Freq", "Prop", "Time", "Time", "Time"];
    } else {
        paramIDs = ["THigh"];
        unitIDs = ["Time"];
    }
    clearInputs();
    generateResults(0);
};
const bufSizeSelect = document.getElementById("chooseAmount");
bufSizeSelect.onchange = () => {
    bufferSize = parseInt(bufSizeSelect.value);
};
const listSelect = document.getElementById("chooseList");
listSelect.onchange = () => {
    document.getElementById("PLLink").href = listSelect.value + ".txt";
    fetch(listSelect.value + ".txt").then((r) => r.text().then(loadFromText));
};
modeSelect.onchange();
listSelect.onchange();

function unitUpdate() {
    let rawId = this.id.slice(4);
    for (let i = 0; i < unitIDs.length; i++) {
        if (unitIDs[i] != rawId) continue;
        let elem = document.getElementById("inp" + paramIDs[i]);
        setValue(i, oscParams[paramIDs[i]]);
    }
}
unitIDs.forEach((id) => {
    let elem = document.getElementById("unit" + id);
    elem.onchange = unitUpdate;
});

function paramUpdate() {
    let rawId = this.id.slice(3);
    let index = paramIDs.indexOf(rawId);
    if (!parseFloat(this.value)) {
        paramError(`invalid value "${this.value}" for input "${rawId}"`);
        if (this.classList.contains("driving")) {
            this.classList.remove("driving");
            delete driving[rawId];
            freeInputs(rawId);
            filledOut--;
            fillInputs();
        }
        return;
    }
    if (!this.classList.contains("driving")) {
        this.classList.add("driving");
        driving[rawId] = true;
        filledOut++;
    }
    if (filledOut == 2) {
        let trimmed = trimInput(getValue(index), rawId);
        if (trimmed !== false) setValue(index, trimmed);
    }
    fillInputs();
}
function paramError(e) {
    console.error(e);
}

clearInputs();

function fillInputs() {
    oscParams = {};
    for (let i = 0; i < paramIDs.length; i++) {
        let id = paramIDs[i];
        let elem = document.getElementById("inp" + id);
        if (!driving[id]) continue;
        oscParams[id] = getValue(i);
    }

    if (!astable) {
        if (oscParams.THigh) {
            updateDrivingKeys();
            results = findComponents(
                oscParams,
                drivingKeys,
                astable,
                bufferSize
            );
            generateResults(listPerClick);
        }
        return;
    }

    if (oscParams.Freq) oscParams.Period = oscParams.Freq.inverse();
    if (filledOut > 1) {
        if (oscParams.TLow && oscParams.THigh)
            oscParams.Period = oscParams.TLow.add(oscParams.THigh);
        if (oscParams.Duty) {
            if (oscParams.THigh) {
                oscParams.Period = oscParams.THigh.div(oscParams.Duty);
            } else if (oscParams.TLow) {
                oscParams.Period = oscParams.TLow.div(
                    new sciVal(1).sub(oscParams.Duty)
                );
            }
        }
        //now Period is always set
        if (oscParams.Duty) {
            oscParams.THigh =
                oscParams.THigh || oscParams.Period.mul(oscParams.Duty);
            oscParams.TLow =
                oscParams.TLow ||
                oscParams.Period.mul(new sciVal(1).sub(oscParams.Duty));
        }
        if (oscParams.TLow)
            oscParams.THigh =
                oscParams.THigh || oscParams.Period.sub(oscParams.TLow);
        if (oscParams.THigh)
            oscParams.TLow =
                oscParams.TLow || oscParams.Period.sub(oscParams.THigh);
        //now Period, TLow and THigh are always set
        oscParams.Duty =
            oscParams.Duty || oscParams.THigh.div(oscParams.Period);
    }
    if (oscParams.Period)
        oscParams.Freq = oscParams.Freq || oscParams.Period.inverse();

    if (oscParams.Duty && oscParams.Duty.toFloat() < 0.5) {
        document.getElementById("warningDuty").classList.remove("hidden");
        oscParams.Duty = new sciVal(1 - oscParams.Duty.toFloat());
        let s = oscParams.TLow;
        oscParams.TLow = oscParams.THigh;
        oscParams.THigh = s;
    } else {
        document.getElementById("warningDuty").classList.add("hidden");
    }

    for (let i = 0; i < paramIDs.length; i++) {
        let id = paramIDs[i];
        let elem = document.getElementById("inp" + id);
        if (driving[id]) continue;
        if (!oscParams[id]) continue;
        elem.disabled = true;
        setValue(i, oscParams[id]);
    }

    if (filledOut == 2) {
        updateDrivingKeys();
        results = findComponents(oscParams, drivingKeys, astable, bufferSize);
        generateResults(listPerClick);
    }
}

const updateDrivingKeys = () => {
    drivingKeys = [];
    for (let k in driving) {
        drivingKeys.push(k);
    }
};

function generateResults(limit = 0, start = 0) {
    let container = document.getElementById("resultEntries");
    let entry, d1, d2;
    document
        .getElementById("butExpandResults")
        .classList.toggle(
            "hidden",
            limit == 0 || results.length <= start + limit
        );
    if (limit == 0) {
        nextListing = 0;
        container.innerHTML = "";
        return;
    }
    if (start == 0) {
        nextListing = 0;
        container.innerHTML = "";
        entry = document.createElement("div");
        entry.classList.add("resEntry");
        d1 = document.createElement("div");
        d2 = document.createElement("div");

        for (let i = 0; i < 5; i++) {
            if (!astable && i == 1) continue;
            if (!astable && i == 4) continue;
            let val = document.createElement("p");
            val.innerText =
                i < 3 ? ["R1", "R2", "C"][i] : paramNames[drivingKeys[i - 3]];
            (i < 3 ? d1 : d2).appendChild(val);
        }
        entry.appendChild(d1);
        entry.appendChild(d2);
        container.appendChild(entry);
    }

    for (let k = start; k < Math.min(results.length, start + limit); k++) {
        let r = results[k];
        let osc = astable
            ? calcAstableT(resistors[r[1]], resistors[r[2]], capacitors[r[3]])
            : calcMstableT(resistors[r[1]], capacitors[r[3]]);
        console.log(osc);
        console.log(drivingKeys);
        entry = document.createElement("div");
        entry.classList.add("resEntry");
        d1 = document.createElement("div");
        d2 = document.createElement("div");
        for (let i = 0; i < 3; i++) {
            if (!astable && i == 1) continue;
            let val = document.createElement("p");
            val.innerText = [resistors, resistors, capacitors][i][
                r[i + 1]
            ].toSIStr("ΩΩF"[i]);
            d1.appendChild(val);
        }
        for (let i = 0; i <= (astable ? 1 : 0); i++) {
            let val = document.createElement("p");
            val.innerText = osc[drivingKeys[i]].toSIStr(
                unitSymbs[unitIDs[paramIDs.indexOf(drivingKeys[i])]],
                3,
                drivingKeys[i] == "Duty" ? -2 : false
            );
            d2.appendChild(val);
        }
        console.log(r);

        entry.appendChild(d1);
        entry.appendChild(d2);
        container.appendChild(entry);
    }
    nextListing += limit;
}

document.getElementById("butExpandResults").onclick = () => {
    generateResults(listPerClick, nextListing);
};

let lenientFloor = (x) => {
    if (Math.ceil(x) - x < 0.01) return Math.ceil(x);
    return Math.floor(x);
};

function getValue(i) {
    let rawVal = parseFloat(document.getElementById("inp" + paramIDs[i]).value);
    let scale = parseInt(document.getElementById("unit" + unitIDs[i]).value);
    return new sciVal(rawVal, scale);
}
function setValue(i, val) {
    let scale = parseInt(document.getElementById("unit" + unitIDs[i]).value);
    document.getElementById("inp" + paramIDs[i]).value = sigFig(
        val.toFloat(-scale),
        3,
        lenientFloor
    );
}
function freeInputs(keep = null) {
    for (let id of paramIDs) {
        let elem = document.getElementById("inp" + id);
        if (driving[id]) continue;
        if (["Period", "Freq"].includes(id)) {
            if (driving.Freq || driving.Period) continue;
        }
        if (keep && keep == id) continue;
        elem.value = "";
        elem.disabled = false;
        delete oscParams[id];
    }
}
function clearInputs() {
    filledOut = 0;
    for (let id of paramIDs) {
        let elem = document.getElementById("inp" + id);
        elem.value = "";
        elem.classList.remove("driving");
        elem.disabled = false;
    }
}

//once typing stopped
function trimInput(val, type) {
    let unit = unitSymbs[unitIDs[paramIDs.indexOf(type)] || ""];
    //duty <= 1
    //TLow & THigh <= Period

    console.log(val.toFloat());
    let max, min;
    switch (type) {
        case "Duty":
            if (val.toFloat() > 0.999) return new sciVal(0.999);
            break;
        case "Freq":
            max = Infinity;
            if (driving.TLow) {
                max = oscParams.TLow.inverse().toFloat() * 0.999;
            } else if (driving.THigh) {
                max = oscParams.THigh.inverse().toFloat() * 0.999;
            }
            if (val.toFloat() > max) return new sciVal(max);
            break;
        case "Period":
            min = -Infinity;
            if (driving.TLow) {
                min = oscParams.TLow.toFloat() * 1.01;
            } else if (driving.THigh) {
                min = oscParams.THigh.toFloat() * 1.01;
            }
            if (val.toFloat() < min) return new sciVal(min);
            break;
        case "TLow":
        case "THigh":
            if (driving.TLow && driving.THigh) return false;
            max = oscParams.Period.toFloat() * 0.999;
    }
    //
    let direction = max == Infinity ? (min == -Infinity ? -1 : 0) : 1;
    if (
        (direction == 1 && val.toFloat() > max) ||
        (direction == -1 && val.toFloat() < min)
    ) {
        let trimmed = new sciVal(direction == 1 ? max : min);
        paramError(
            `value "${type}" cant be ${
                direction == 1 ? "larger" : "smaller"
            } than ${trimmed.toSIStr(unit)} (input: ${val.toSIStr(unit)})`
        );
        return trimmed;
    }
    return false;
}
function checkInputs() {}

document.getElementById("butClear").onclick = clearInputs;

/*
getCapCode = (c) => {
    return Math.floor(c.mant * 10) * 10 + (11 + c.exp);
};
getResCode5 = (r) => {
    return "";
};
*/

//fetch("standard.txt").then((r) => r.text().then(loadFromText));
