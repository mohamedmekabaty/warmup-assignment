const fs = require("fs");

// ============================================================
// Function 1: getShiftDuration(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================

// Helper: Parse AM/PM time strictly into seconds since midnight
function parseToSeconds(timeStr) {
    let [time, modifier] = timeStr.split(' ');
    let [hours, minutes, seconds] = time.split(':').map(Number);
    if (hours === 12) hours = 0;
    if (modifier.toLowerCase() === 'pm') hours += 12;
    return hours * 3600 + minutes * 60 + seconds;
}

// Helper: Parse duration string "h:mm:ss" into total seconds
function parseDurationToSeconds(timeStr) {
    let parts = timeStr.split(':').map(Number);
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

// Helper: Format total seconds back into "h:mm:ss"
function formatSeconds(totalSeconds) {
    let hours = Math.floor(totalSeconds / 3600);
    let minutes = Math.floor((totalSeconds % 3600) / 60);
    let seconds = totalSeconds % 60;
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    
function getShiftDuration(startTime, endTime) {
    let startSecs = parseToSeconds(startTime);
    let endSecs = parseToSeconds(endTime);
    
    let durationSecs = endSecs - startSecs;
    if (durationSecs < 0) {
        durationSecs += 24 * 3600; // Handle cross-midnight shifts
    }

    return formatSeconds(durationSecs);
}

// ============================================================
// Function 2: getIdleTime(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function getIdleTime(startTime, endTime) {
    let startSecs = parseToSeconds(startTime);
    let endSecs = parseToSeconds(endTime);
    
    // Shift duration logic
    let durationSecs = endSecs - startSecs;
    if (durationSecs < 0) durationSecs += 24 * 3600;
    
    let shiftEndSecs = startSecs + durationSecs;
    
    // Delivery hours are 8 AM to 10 PM. Check overlap for standard day and next day in case of crossing midnight.
    let activeStart1 = 8 * 3600;
    let activeEnd1 = 22 * 3600;
    let activeStart2 = activeStart1 + 24 * 3600;
    let activeEnd2 = activeEnd1 + 24 * 3600;
    
    let overlap1 = Math.max(0, Math.min(shiftEndSecs, activeEnd1) - Math.max(startSecs, activeStart1));
    let overlap2 = Math.max(0, Math.min(shiftEndSecs, activeEnd2) - Math.max(startSecs, activeStart2));
    
    let activeSecs = overlap1 + overlap2;
    let idleSecs = durationSecs - activeSecs;
    
    return formatSeconds(idleSecs);
}

// ============================================================
// Function 3: getActiveTime(shiftDuration, idleTime)
// shiftDuration: (typeof string) formatted as h:mm:ss
// idleTime: (typeof string) formatted as h:mm:ss
// Returns: string formatted as h:mm:ss
// ============================================================
function getActiveTime(shiftDuration, idleTime) {
    let durationSecs = parseDurationToSeconds(shiftDuration);
    let idleSecs = parseDurationToSeconds(idleTime);
    return formatSeconds(durationSecs - idleSecs);
}

// ============================================================
// Function 4: metQuota(date, activeTime)
// date: (typeof string) formatted as yyyy-mm-dd
// activeTime: (typeof string) formatted as h:mm:ss
// Returns: boolean
// ============================================================
function metQuota(date, activeTime) {
    let activeSecs = parseDurationToSeconds(activeTime);
    let isEidPeriod = date >= "2025-04-10" && date <= "2025-04-30";
    let requiredSecs = isEidPeriod ? (6 * 3600) : (8 * 3600 + 24 * 60);
    return activeSecs >= requiredSecs;
}

// ============================================================
// Function 5: addShiftRecord(textFile, shiftObj)
// textFile: (typeof string) path to shifts text file
// shiftObj: (typeof object) has driverID, driverName, date, startTime, endTime
// Returns: object with 10 properties or empty object {}
// ============================================================
function addShiftRecord(textFile, shiftObj) {
    let lines = fs.readFileSync(textFile, 'utf8').trim().split('\n');
    let header = lines[0];
    
    let records = [];
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i]) continue;
        let p = lines[i].split(',');
        records.push({
            driverID: p[0],
            driverName: p[1],
            date: p[2],
            startTime: p[3],
            endTime: p[4],
            shiftDuration: p[5],
            idleTime: p[6],
            activeTime: p[7],
            metQuota: p[8] === 'true',
            hasBonus: p[9] === 'true'
        });
    }
    
    if (records.some(r => r.driverID === shiftObj.driverID && r.date === shiftObj.date)) {
        return {};
    }
    
    let shiftDuration = getShiftDuration(shiftObj.startTime, shiftObj.endTime);
    let idleTime = getIdleTime(shiftObj.startTime, shiftObj.endTime);
    let activeTime = getActiveTime(shiftDuration, idleTime);
    let quotaMet = metQuota(shiftObj.date, activeTime);
    
    let newRecord = {
        driverID: shiftObj.driverID,
        driverName: shiftObj.driverName,
        date: shiftObj.date,
        startTime: shiftObj.startTime,
        endTime: shiftObj.endTime,
        shiftDuration: shiftDuration,
        idleTime: idleTime,
        activeTime: activeTime,
        metQuota: quotaMet,
        hasBonus: false
    };
    
    records.push(newRecord);
    
    records.sort((a, b) => {
        if (a.driverID < b.driverID) return -1;
        if (a.driverID > b.driverID) return 1;
        if (a.date < b.date) return -1;
        if (a.date > b.date) return 1;
        return 0;
    });
    
    let output = [header];
    for (let r of records) {
        output.push(`${r.driverID},${r.driverName},${r.date},${r.startTime},${r.endTime},${r.shiftDuration},${r.idleTime},${r.activeTime},${r.metQuota},${r.hasBonus}`);
    }
    output.push("");
    
    fs.writeFileSync(textFile, output.join('\n'), 'utf8');
    
    return newRecord;
}

// ============================================================
// Function 6: setBonus(textFile, driverID, date, newValue)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// date: (typeof string) formatted as yyyy-mm-dd
// newValue: (typeof boolean)
// Returns: nothing (void)
// ============================================================
function setBonus(textFile, driverID, date, newValue) {
    let lines = fs.readFileSync(textFile, 'utf8').trim().split('\n');
    let header = lines[0];
    
    let output = [header];
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i]) continue;
        let p = lines[i].split(',');
        if (p[0] === driverID && p[2] === date) {
            p[9] = String(newValue);
        }
        output.push(p.join(','));
    }
    output.push("");
    
    fs.writeFileSync(textFile, output.join('\n'), 'utf8');
}

// ============================================================
// Function 7: countBonusPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof string) formatted as mm or m
// Returns: number (-1 if driverID not found)
// ============================================================
function countBonusPerMonth(textFile, driverID, month) {
    let lines = fs.readFileSync(textFile, 'utf8').trim().split('\n');
    let foundDriver = false;
    let bonusCount = 0;

    let targetMonth = String(parseInt(month, 10)).padStart(2, '0');

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i]) continue;
        let p = lines[i].split(',');

        if (p[0] === driverID) {
            foundDriver = true;
            let recordMonth = p[2].split('-')[1];
            if (recordMonth === targetMonth && p[9] === "true") {
                bonusCount++;
            }
        }
    }

    return foundDriver ? bonusCount : -1;
}

// ============================================================
// Function 8: getTotalActiveHoursPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    let lines = fs.readFileSync(textFile, 'utf8').trim().split('\n');
    let totalSecs = 0;

    let targetMonth = String(parseInt(month, 10)).padStart(2, '0');

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i]) continue;
        let p = lines[i].split(',');

        if (p[0] === driverID) {
            let recordMonth = p[2].split('-')[1];
            if (recordMonth === targetMonth) {
                totalSecs += parseDurationToSeconds(p[7]);
            }
        }
    }

    return formatSeconds(totalSecs);
}

// ============================================================
// Function 9: getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month)
// textFile: (typeof string) path to shifts text file
// rateFile: (typeof string) path to driver rates text file
// bonusCount: (typeof number) total bonuses for given driver per month
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    let rateLines = fs.readFileSync(rateFile, 'utf8').trim().split('\n');
    let dayOff = "";
    for (let line of rateLines) {
        if (!line) continue;
        let p = line.split(',');
        if (p[0] === driverID) {
            dayOff = p[1];
            break;
        }
    }

    let shiftLines = fs.readFileSync(textFile, 'utf8').trim().split('\n');
    let targetMonth = String(parseInt(month, 10)).padStart(2, '0');
    let uniqueDates = new Set();

    for (let i = 1; i < shiftLines.length; i++) {
        if (!shiftLines[i]) continue;
        let p = shiftLines[i].split(',');
        if (p[0] === driverID && p[2].split('-')[1] === targetMonth) {
            uniqueDates.add(p[2]);
        }
    }

    let requiredSecs = 0;
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    for (let dateStr of uniqueDates) {
        let d = new Date(dateStr + "T00:00:00");
        let dayName = days[d.getDay()];

        if (dayName === dayOff) {
            continue; // required = 0
        }

        let isEid = dateStr >= "2025-04-10" && dateStr <= "2025-04-30";
        if (isEid) {
            requiredSecs += 6 * 3600;
        } else {
            requiredSecs += 8 * 3600 + 24 * 60;
        }
    }

    requiredSecs -= bonusCount * 2 * 3600;
    if (requiredSecs < 0) requiredSecs = 0;

    return formatSeconds(requiredSecs);
}

// ============================================================
// Function 10: getNetPay(driverID, actualHours, requiredHours, rateFile)
// driverID: (typeof string)
// actualHours: (typeof string) formatted as hhh:mm:ss
// requiredHours: (typeof string) formatted as hhh:mm:ss
// rateFile: (typeof string) path to driver rates text file
// Returns: integer (net pay)
// ============================================================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    let rateLines = fs.readFileSync(rateFile, 'utf8').trim().split('\n');
    let basePay = 0;
    let tier = 0;
    for (let line of rateLines) {
        if (!line) continue;
        let p = line.split(',');
        if (p[0] === driverID) {
            basePay = parseInt(p[2], 10);
            tier = parseInt(p[3], 10);
            break;
        }
    }

    let actSecs = parseDurationToSeconds(actualHours);
    let reqSecs = parseDurationToSeconds(requiredHours);

    let diffSecs = reqSecs - actSecs;
    if (diffSecs <= 0) {
        return basePay;
    }

    let missingHours = Math.floor(diffSecs / 3600);

    let allowedMissing = 0;
    if (tier === 1) allowedMissing = 50;
    else if (tier === 2) allowedMissing = 20;
    else if (tier === 3) allowedMissing = 10;
    else if (tier === 4) allowedMissing = 3;

    let deductibleHours = Math.max(0, missingHours - allowedMissing);
    let deductionRate = Math.floor(basePay / 185);
    let deduction = deductibleHours * deductionRate;

    return basePay - deduction;
}

module.exports = {
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord,
    setBonus,
    countBonusPerMonth,
    getTotalActiveHoursPerMonth,
    getRequiredHoursPerMonth,
    getNetPay
};
