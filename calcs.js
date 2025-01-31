class sciVal {
    constructor(mant, exp = 0) {
        if (mant >= 10 || mant < 1) {
            let scale = Math.floor(Math.log10(mant));
            this.mant = mant / 10 ** scale;
            this.exp = exp + scale;
            return;
        }
        this.mant = mant;
        this.exp = exp;
    }
    add(other) {
        let exp = Math.max(this.exp, other.exp);
        return new sciVal(
            this.mant / 10 ** (exp - this.exp) +
                other.mant / 10 ** (exp - other.exp),
            exp
        );
    }
    sub(other) {
        let exp = Math.max(this.exp, other.exp);
        return new sciVal(
            this.mant / 10 ** (exp - this.exp) -
                other.mant / 10 ** (exp - other.exp),
            exp
        );
    }
    mul(other) {
        return new sciVal(this.mant * other.mant, this.exp + other.exp);
    }
    div(other) {
        return new sciVal(this.mant / other.mant, this.exp - other.exp);
    }
    scale(scale) {
        return new sciVal(this.mant * scale, this.exp);
    }
    inverse() {
        return new sciVal(1 / this.mant, -this.exp);
    }
    toFloat(shift = 0) {
        return this.mant * 10 ** (this.exp + shift);
    }
    toSIStr(unit = "", prec = 3, fixed = false) {
        let newExp;
        if (fixed === false) {
            let diff = ((this.exp % 3) + 3) % 3;
            newExp = this.exp - diff;
            return (
                Math.round(this.mant * 10 ** (diff + prec)) / 10 ** prec +
                (newExp == 0 ? "" : SI_PRE_SYMBS[3 - newExp / 3]) +
                unit
            );
        } else {
            newExp = fixed;
            return (
                Math.round(this.mant * 10 ** (this.exp - fixed + prec)) /
                    10 ** prec +
                unit
            );
        }
    }
}

const sigFig = (val, f, rounding) => {
    let i = Math.ceil(Math.log10(val));
    return rounding(val * 10 ** (f - i)) / 10 ** (f - i);
};

function findComponents(target, driving, astable, bestBuffer = 1) {
    let best = [[Infinity]];
    let res, err;
    for (let r2 = 0; r2 < (astable ? resistors.length : 1); r2++) {
        for (let r1 = 0; r1 < resistors.length; r1++) {
            for (let c = 0; c < capacitors.length; c++) {
                if (astable) {
                    res = calcAstableT(
                        resistors[r1],
                        resistors[r2],
                        capacitors[c]
                    );
                    err = calc2Err(target, res, driving);
                } else {
                    res = calcMstableT(resistors[r1], capacitors[c]);
                    err = calc1Err(target.THigh, res.THigh);
                }
                if (err < best[best.length - 1][0]) {
                    for (let i = best.length; i >= 0; i--) {
                        if (i == 0 || best[i - 1][0] <= err) {
                            best.splice(i, 0, [err, r1, r2, c]);
                            break;
                        }
                    }
                    if (best.length > bestBuffer) best.pop();
                }
            }
        }
    }
    return best;
}

let precCutoff = 10;
calc2Err = (t, r, d) => {
    t1 = t[d[0]];
    t2 = t[d[1]];
    r1 = r[d[0]];
    r2 = r[d[1]];
    if (Math.abs(r1.exp - t1.exp) > precCutoff) return NaN;
    if (Math.abs(r2.exp - t2.exp) > precCutoff) return NaN;
    d1 = Math.abs(r1.toFloat() / t1.toFloat() - 1);
    d2 = Math.abs(r2.toFloat() / t2.toFloat() - 1);
    return Math.max(d1, d2);
};
calc1Err = (v, t) => {
    if (Math.abs(v.exp - t.exp) > precCutoff) return NaN;
    return Math.abs(v.toFloat() / t.toFloat() - 1);
};

calcAstableT = (r1, r2, c) => {
    r12 = r1.add(r2);
    result = {};
    result.THigh = new sciVal(Math.LN2 * r12.mant * c.mant, r12.exp + c.exp);
    result.TLow = new sciVal(Math.LN2 * r2.mant * c.mant, r2.exp + c.exp);
    result.Period = result.THigh.add(result.TLow);
    result.Duty = result.THigh.div(result.Period);
    result.Freq = result.Period.inverse();
    return result;
};
calcMstableT = (r1, c) => {
    result = {};
    result.THigh = new sciVal(Math.LN3 * r1.mant * c.mant, r1.exp + c.exp);
    return result;
};
