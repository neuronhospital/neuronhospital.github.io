/* v75: v74 baseline + persistent-client recovery support. */
/**
 * NEURON Hospital Appointment Backend — v77
 *
 * Idempotent OPD + EEG booking.
 *
 * Spreadsheet: one sheet per city.
 *
 * Columns:
 * A Appointment ID
 * B Date (DDMMYYYY)
 * C Booking Timestamp
 * D Patient Name
 * E Age
 * F Address
 * G Patient Type
 * H Whatsapp Number
 * I Visiting City
 * J Referred By
 * K Next Followup City
 * L OPD Charges
 * M OPD Cash
 * N OPD Online
 * O EEG Charges
 * P EEG Cash
 * Q EEG Online
 * R Booking Request ID
 * S EEG Booking Request ID
 * T EEG Update Request ID
 *
 * IMPORTANT:
 * 1. This version is designed for the supplied clean spreadsheet. No historical rows are migrated.
 * 2. Paste this entire file into Extensions -> Apps Script.
 * 3. No setupSheets() run is required. Sheets/headers are checked automatically.
 * 4. Deploy as Web app -> Execute as Me -> Who has access: Anyone.
 * 5. Put the current/new /exec URL into index.html.
 *
 * The request-ID columns are what make a booking idempotent:
 * if the browser times out after the spreadsheet was updated, the
 * next request returns the existing booking instead of creating another.
 */

const SHEET_NAMES = [
  "Latur","Nilanga","Udgir","Beed","Ambajogai",
  "Parli","Dharashiv","Omerga","Barshi"
];

const HEADERS = [
  "Appointment ID",
  "Date (DDMMYYYY)",
  "Booking Timestamp",
  "Patient Name",
  "Age",
  "Address",
  "Patient Type",
  "Whatsapp Number",
  "Visiting City",
  "Referred By",
  "Next Followup City",
  "OPD Charges",
  "OPD Cash",
  "OPD Online",
  "EEG Charges",
  "EEG Cash",
  "EEG Online",
  "Booking Request ID",
  "EEG Booking Request ID",
  "EEG Update Request ID",
  "OPD Refund",
  "EEG Refund"
];



/* ============================================================================
   VISIT SCHEDULE — CANONICAL CITY INFORMATION
   ========================================================================== */

const VISIT_INFO = {
  Latur: {hospital:"NEURON Hospital", address:"Below Jockey Store, In front of Ashwini Hospital, Near Patil Plaza, Ausa Road, Latur", schedule:"Monday–Friday 8 AM–10 PM; Saturday 3 PM–10 PM; Thursday & Sunday closed; 5th Thursday 8 AM–10 PM", phone:"02382 242581"},
  Nilanga: {hospital:"Salunke Hospital", address:"Opp. Bus Stand, Nilanga", schedule:"1st Saturday of Every Month; 8 AM–2 PM", phone:"9172515151"},
  Udgir: {hospital:"Shiv Parvati Hospital", address:"Opp. Axis Bank, Degloor Road, Udgir", schedule:"2nd & 4th Sunday of Every Month; 8 AM–8 PM", phone:"7821960813"},
  Beed: {hospital:"Shivkamal Hospital", address:"Behind Mantri Bank, Jalna Road, Beed", schedule:"2nd & 4th Thursday of Every Month; 7 AM–10 PM", phone:"02442 223636, 9359449022"},
  Ambajogai: {hospital:"Vaidyanath Hospital", address:"Reddy Hospital Ground Floor, Behind Bus Stand, Ambajogai", schedule:"1st & 3rd Sunday of Every Month; 2 PM–9 PM", phone:"9075246888"},
  Parli: {hospital:"Arogya Hospital", address:"Nath Road, Parli", schedule:"1st & 3rd Sunday of Every Month; 8 AM–1 PM", phone:"9284235642, 8605052726"},
  Dharashiv: {hospital:"Pranada Clinic", address:"Opp. Central Jail, Yedshi Road, Dharashiv", schedule:"1st & 3rd Thursday of Every Month; 8 AM–3 PM", phone:"9405788011"},
  Barshi: {hospital:"Jagdale Mama Hospital", address:"Barshi", schedule:"1st & 3rd Thursday of Every Month; 3 PM–8 PM", phone:"8010824285"},
  Omerga: {hospital:"Aadhar Hospital", address:"Near Birajdar Children Hospital, New Arogya Nagar, Omerga", schedule:"Every Saturday except 1st; 8 AM–3 PM", phone:"8010824285"}
};

const DEFAULT_OPD_CHARGES = 500;
const DEFAULT_EEG_CHARGES = 1600;
const DEFAULT_EEG_CHARGES_LATUR = 1100;
const PAYMENT_MODES = ["Cash", "Online", "Split", "Cash + Online"];

/*
 * PERFORMANCE:
 * Normal searches inspect only the newest 1,000 rows in a city.
 * Older records are NOT deleted. If a request-ID/appointment lookup is
 * not found in the active window, the code falls back to the full sheet.
 *
 * This gives the normal booking/retrieval path a bounded search size
 * without risking loss of historical records or idempotency.
 */
const ACTIVE_SEARCH_ROWS = 1000;
const MIN_EEG_CHARGES = 0;
const MAX_EEG_CHARGES = 3000;

// Secure administrative OPD charge update access.
// Kept in Code.gs and never placed in the public HTML.
const OPD_CHARGE_PASSWORD = "neuron@357";



/*
 * Static-configuration cache helper.
 * Deliberately NOT used for patient/booking/status data.
 */

/*
 * Used only for safe initialization/reconciliation of the appointment
 * counter. Normal bookings use the fast property counter.
 */
function getMaxSerialForDate_(sheet, dateString) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  let maxSerial = 0;

  ids.forEach(function(row) {
    const id = String(row[0] || "");
    const parts = id.split("-");
    if (parts.length !== 3 || parts[1] !== dateString) return;

    const serial = Number(parts[2]);
    if (Number.isFinite(serial) && serial > maxSerial) {
      maxSerial = serial;
    }
  });

  return maxSerial;
}

function getCachedStatic_(key, producer, ttlSeconds) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(key);
  if (cached !== null) return cached;
  const value = String(producer());
  cache.put(key, value, ttlSeconds || 300);
  return value;
}

function doGet() {
  ensureSheets_();

  return json_({
    ok: true,
    service: "NEURON Hospital Appointment Backend",
    version: "2026-08-24-HTML78-v5-CODE78-v5"
  });
}

function doPost(e) {
  try {
    ensureSheets_();

    const body = JSON.parse(e.postData.contents || "{}");
    const action = String(body.action || "").trim();

    switch (action) {
      case "bookAppointment":
        return json_(bookAppointment_(body));

      case "checkBookingRequest":
        return json_(checkBookingRequest_(body));

      case "getPortalBootstrapV2":
        return json_(getPortalBootstrapV2_(body));

      case "getTodayVisitCitiesV2":
        return json_(getTodayVisitCitiesV2_(body));

      case "getPatientByWhatsApp":
        return json_(getPatientByWhatsApp_(body));

      case "getPatientHistoryByWhatsApp":
        return json_(getPatientHistoryByWhatsApp_(body));

      case "getRefundPatientByWhatsApp":
        return json_(getRefundPatientByWhatsApp_(body));

      case "saveRefund":
        return json_(saveRefund_(body));

      case "getAvailableDates":
        return json_(getAvailableDates_(body));

      case "updateOPDDetails":
        return json_(updateOPDDetails_(body));

      case "updateEEGDetails":
        return json_(updateEEGDetails_(body));

      case "getUpdateStatus":
        return json_(getUpdateStatus_(body));

      case "getEEGPatientsByWhatsApp":
        return json_(getEEGPatientsByWhatsApp_(body));

      case "getEEGBookingPatientsByWhatsApp":
        return json_(getEEGBookingPatientsByWhatsApp_(body));

      case "getEEGBookedPatientsByWhatsApp":
        return json_(getEEGBookedPatientsByWhatsApp_(body));

      case "retrieveEEGPatientFresh":
        return json_(retrieveEEGPatientFresh_(body));

      case "bookEEG":
        return json_(bookEEG_(body));

      case "checkEEGBookingRequest":
        return json_(checkEEGBookingRequest_(body));

      case "getEEGStatus":
        return json_(getEEGStatus_(body));

      case "updateOPDCharges":
        return json_(updateOPDCharges_(body));

      case "getOPDChargeStatus":
        return json_(getOPDChargeStatus_(body));

      case "getAvailability":
        return json_({
          ok: true,
          slots: []
        });

      case "getTodayVisitCities":
        return json_(getTodayVisitCities_());

      case "retrieveRecords":
        return json_(retrieveRecords_(body));

      case "syncRetrievalCache":
        return json_(syncRetrievalCache_(body));

      case "health":
        return json_({
          ok: true,
          service: "NEURON Hospital Appointment Backend",
          version: "2026-08-24-HTML78-v5-CODE78-v5",
          spreadsheet: !!SpreadsheetApp.getActiveSpreadsheet()
        });

      default:
        throw new Error("Unknown action: " + action);
    }

  } catch (err) {
    return json_({
      ok: false,
      error: err && err.message ? err.message : String(err)
    });
  }
}


/* ============================================================================
   AUTOMATIC DATABASE INITIALIZATION
   ========================================================================== */

/*
 * No manual setupSheets() step is required.
 *
 * Every request verifies that the nine city sheets exist and that the
 * expected headers are present. This is intentionally safe for the clean
 * spreadsheet supplied with this version.
 */
function ensureSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss) {
    throw new Error(
      "No spreadsheet is attached to this Apps Script project. " +
      "Open the NEW Google Spreadsheet, then choose Extensions > Apps Script " +
      "and paste this Code.gs there."
    );
  }

  /*
   * PERFORMANCE: after the first successful initialization, avoid doing
   * nine sheet lookups and any maintenance work on every API request. The
   * cache is intentionally long-lived because sheet structure is static.
   */
  const cache = CacheService.getScriptCache();
  if (cache.get("NEURON_SHEETS_READY_V17") === "1") {
    return ss;
  }

  SHEET_NAMES.forEach(function(name) {
    let sheet = ss.getSheetByName(name);

    if (!sheet) {
      sheet = ss.insertSheet(name);
      ensureHeader_(sheet);
      styleSheet_(sheet);
    }
  });

  // The supplied spreadsheet is intentionally blank. Remove the default
  // Sheet1 only when it is still completely empty and is not one of the
  // application city sheets.
  const defaultSheet = ss.getSheetByName("Sheet1");
  if (defaultSheet && SHEET_NAMES.indexOf("Sheet1") === -1 &&
      defaultSheet.getLastRow() === 0 && defaultSheet.getLastColumn() <= 1 &&
      ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  /*
   * IMPORTANT PERFORMANCE CHANGE:
   * Do not run the historical patient-row formatting migration from a live
   * booking request. That migration touches every patient row in all city
   * sheets and can make an otherwise fast booking exceed the browser timeout.
   * Existing row formatting is preserved; new rows are formatted by the
   * booking path itself.
   */

  cache.put("NEURON_SHEETS_READY_V17", "1", 21600);
  return ss;
}

/* ============================================================================
   TODAY'S ACTIVE VISIT CITIES
   ========================================================================== */

// Shared by OPD and EEG UI logic: returns every city where the doctor
// is physically scheduled to be available at the current India date/time.
// The frontend uses the same schedule rules for automatic city selection,
// while the backend remains authoritative for requests that need validation.
function getTodayVisitCities_() {
  const now=new Date(),tz="Asia/Kolkata";
  const day=Number(Utilities.formatDate(now,tz,"u"));
  const date=Number(Utilities.formatDate(now,tz,"d"));
  const minutes=Number(Utilities.formatDate(now,tz,"H"))*60+Number(Utilities.formatDate(now,tz,"m"));
  const ordinal=Math.floor((date-1)/7)+1;
  const inWindow=(a,b)=>minutes>=a*60&&minutes<b*60;
  const cities=[];
  if(((day>=1&&day<=3)||(day===5))&&inWindow(8,22) ||
     (day===4&&ordinal===5&&inWindow(8,22)) ||
     (day===6&&inWindow(15,22))) cities.push("Latur");
  if(day===6&&ordinal===1&&inWindow(8,14)) cities.push("Nilanga");
  if(day===7&&(ordinal===2||ordinal===4)&&inWindow(8,20)) cities.push("Udgir");
  if(day===4&&(ordinal===2||ordinal===4)&&inWindow(7,22)) cities.push("Beed");
  if(day===7&&(ordinal===1||ordinal===3)&&inWindow(14,21)) cities.push("Ambajogai");
  if(day===7&&(ordinal===1||ordinal===3)&&inWindow(8,13)) cities.push("Parli");
  if(day===4&&(ordinal===1||ordinal===3)&&inWindow(8,15)) cities.push("Dharashiv");
  if(day===4&&(ordinal===1||ordinal===3)&&inWindow(15,20)) cities.push("Barshi");
  if(day===6&&ordinal!==1&&inWindow(8,15)) cities.push("Omerga");
  return {ok:true,cities: cities,timezone:tz};
}

/* ============================================================================
   OPD BOOKING - IDEMPOTENT
   ========================================================================== */

function normalizePayment_(mode,cash,online,charges,label){
  mode=clean_(mode||"Cash");
  if(PAYMENT_MODES.indexOf(mode)<0) mode="Cash";

  const charge=Number(charges);
  if(!Number.isFinite(charge)||charge<0)
    throw new Error("Invalid "+label+" charges.");

  let c=Number(cash);
  let o=Number(online);

  /*
   * EEG payment is payment-driven. The actual Cash/Online total entered
   * by the user is the EEG charge. Do not reject it against the city
   * default or an older EEG charge.
   */
  if(label==="EEG"){
    if(!Number.isFinite(c)||c<0||!Number.isFinite(o)||o<0)
      throw new Error("Enter valid EEG payment amounts.");

    const total=c+o;

    return {
      mode:mode,
      cashPaid:c,
      onlinePaid:o,
      totalPaid:total
    };
  }

  /*
   * Existing OPD/payment behavior remains unchanged.
   */
  if(mode==="Cash"){
    if(!Number.isFinite(c)||c<0) c=0;
    o=0;
  }else if(mode==="Online"){
    c=0;
    if(!Number.isFinite(o)||o<0) o=0;
  }else{
    if(!Number.isFinite(c)||c<0||!Number.isFinite(o)||o<0)
      throw new Error("Enter valid Cash and Online payment amounts for "+label+".");
  }

  if(c+o>charge+0.001)
    throw new Error(label+" payment cannot exceed the charges.");

  return {
    mode:mode,
    cashPaid:c,
    onlinePaid:o,
    totalPaid:c+o
  };
}
function historicalPayment_(charges){const n=Number(charges);return {cashPaid:Number.isFinite(n)?n:0,onlinePaid:0,totalPaid:Number.isFinite(n)?n:0};}
function getStoredPayment_(row,cashIdx,onlineIdx,charges){
  const c=Number(row[cashIdx]),o=Number(row[onlineIdx]);
  if(Number.isFinite(c)&&Number.isFinite(o)&&(c!==0||o!==0)) return {cashPaid:c,onlinePaid:o,totalPaid:c+o};
  return historicalPayment_(charges);
}
function normalizeNameForDuplicate_(v){return String(v||"").toLowerCase().replace(/[^a-z0-9]/g,"");}
function levenshtein_(a,b){a=String(a||"");b=String(b||"");const p=Array(b.length+1);for(let j=0;j<=b.length;j++)p[j]=j;for(let i=1;i<=a.length;i++){let q=[i];for(let j=1;j<=b.length;j++)q[j]=Math.min(q[j-1]+1,p[j]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));for(let j=0;j<=b.length;j++)p[j]=q[j];}return p[b.length];}
function namesLikelySame_(a,b){a=normalizeNameForDuplicate_(a);b=normalizeNameForDuplicate_(b);if(!a||!b)return false;if(a===b)return true;const m=Math.max(a.length,b.length);return m>=4&&(1-levenshtein_(a,b)/m)>=0.72;}
function findDuplicatePatientBooking_(ss,city,phone,age,ageUnit,name,today){
  const sh=ss.getSheetByName(city);
  if(!sh||sh.getLastRow()<2)return null;

  const totalRows=sh.getLastRow()-1;
  const scanRanges=[Math.min(ACTIVE_SEARCH_ROWS,totalRows)];
  if(totalRows>ACTIVE_SEARCH_ROWS)scanRanges.push(totalRows-ACTIVE_SEARCH_ROWS);

  for(let pass=0;pass<scanRanges.length;pass++){
    const count=scanRanges[pass];
    const startRow=pass===0 ? totalRows-count+2 : 2;
    const v=sh.getRange(startRow,2,count,8).getDisplayValues();

    for(let i=0;i<count;i++){
      const x=v[i];
      if(normalizeDisplayedBookingDateDDMMYYYY_(x[0])!==today||normalizePhone_(x[6])!==phone)continue;
      if(Number(parseAgeValue_(x[3]))!==Number(age)||String(parseAgeUnit_(x[3])).toLowerCase()!==String(ageUnit).toLowerCase())continue;

      const rowNumber=startRow+i;
      const row=sh.getRange(rowNumber,1,1,HEADERS.length).getValues()[0];
      if(!namesLikelySame_(name,row[3]))continue;

      return {row:row,rowNumber:rowNumber,sheet:sh,appointmentId:row[0],date:row[1],patientName:row[3],age:parseAgeValue_(row[4]),ageUnit:parseAgeUnit_(row[4]),city:row[8]||city,patientType:row[6],address:row[5]||"",opdCharges:row[11],nextFollowupCity:row[10]||""};
    }

    // If the active window was searched and no duplicate was found, the
    // historical fallback preserves v67 behavior for unusual old rows.
  }

  return null;
}

function bookAppointment_(data) {
  const requestId = clean_(data.bookingRequestId);

  if (!requestId) {
    throw new Error(
      "Booking request ID is missing. Please refresh and try again."
    );
  }

  const city = normalizeCity_(data.city);
  const requestedDate = normalizeAnyBookingDateDDMMYYYY_(data.appointmentDate || data.date || "");
  if (!requestedDate) throw new Error("Appointment date is required.");
  validateVisitDateForCity_(city, requestedDate);
  const name = clean_(data.childName);
  const age = Number(data.age);
  const ageUnit = clean_(data.ageUnit);
  const phone = normalizePhone_(data.whatsapp);
  const patientType = clean_(data.patientType || "Follow-up");
  const address = clean_(data.address);
  const referredBy = clean_(data.referredBy);
  const nextFollowupCity = clean_(data.nextFollowupCity);

  let opdCharges =
    data.opdCharges === "" || data.opdCharges == null
      ? DEFAULT_OPD_CHARGES
      : Number(data.opdCharges);

  /*
   * OPD has no separate visible charge input. The entered payment amount
   * is the authoritative OPD charge. This prevents a stale hidden default
   * (₹500) from rejecting a legitimate amount such as ₹700 Online.
   */
  const paymentModeForCharge = clean_(data.opdPaymentMode || "Cash");
  const rawCashForCharge = Number(data.opdCashPaid);
  const rawOnlineForCharge = Number(data.opdOnlinePaid);
  const paymentTotalForCharge =
    paymentModeForCharge === "Cash"
      ? rawCashForCharge
      : paymentModeForCharge === "Online"
        ? rawOnlineForCharge
        : rawCashForCharge + rawOnlineForCharge;

  if(Number.isFinite(paymentTotalForCharge) && paymentTotalForCharge >= 0 && paymentTotalForCharge <= 2000){
    opdCharges = paymentTotalForCharge;
  }

  validateAppointment_(
    name, age, ageUnit, phone, patientType, opdCharges
  );

  const opdPayment=normalizePayment_(data.opdPaymentMode,data.opdCashPaid,data.opdOnlinePaid,opdCharges,"OPD");

  // Next Followup City is stored for every OPD booking. The receptionist may select any of the nine visiting cities.
  const validatedNextFollowupCity = validateNextFollowupCity_(nextFollowupCity);

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  /*
   * Fast idempotency check before acquiring the global lock.
   */
  const fastExisting = findBookingRequest_(ss, requestId, city);
  if (fastExisting) {
    return {
      ok: true,
      alreadyRecorded: true,
      appointmentId: fastExisting.appointmentId,
      date: fastExisting.date,
      patientName: fastExisting.patientName,
      age: fastExisting.age,
      ageUnit: fastExisting.ageUnit,
      city: fastExisting.city,
      patientType: fastExisting.patientType,
      address: fastExisting.address || "",
      opdCharges: fastExisting.opdCharges,
      opdCashPaid: fastExisting.opdCashPaid,
      opdOnlinePaid: fastExisting.opdOnlinePaid,
      opdTotalPaid: fastExisting.opdTotalPaid,
      nextFollowupCity: fastExisting.nextFollowupCity || ""
    };
  }

  const lock = LockService.getScriptLock();
  /*
   * Keep the critical section short. If another booking is using the
   * script lock, fail quickly; the browser recovery logic will retry the
   * SAME request ID safely rather than making the patient wait 15 seconds.
   */
  if (!lock.tryLock(4000)) {
    throw new Error("Booking service is temporarily busy. Please retry.");
  }

  try {

    /*
     * CRITICAL:
     * Check the spreadsheet AGAIN inside the lock immediately before creating anything.
     * This is what handles a lost browser response.
     */
    const existing = findBookingRequest_(ss, requestId, city);

    if (existing) {
      return {
        ok: true,
        alreadyRecorded: true,
        appointmentId: existing.appointmentId,
        date: existing.date,
        patientName: existing.patientName,
        age: existing.age,
        ageUnit: existing.ageUnit,
        city: existing.city,
        patientType: existing.patientType,
        address: existing.address || "",
        opdCharges: existing.opdCharges,
        opdCashPaid: existing.opdCashPaid,
        opdOnlinePaid: existing.opdOnlinePaid,
        opdTotalPaid: existing.opdTotalPaid,
        nextFollowupCity: existing.nextFollowupCity || ""
      };
    }

    const duplicate=findDuplicatePatientBooking_(ss,city,phone,age,ageUnit,name,getTodayDDMMYYYY_());
    if(duplicate){
      const p=getStoredPayment_(duplicate.row,12,13,duplicate.opdCharges);
      return {ok:true,alreadyRecorded:true,duplicateDetected:true,appointmentId:duplicate.appointmentId,date:duplicate.date,patientName:duplicate.patientName,age:duplicate.age,ageUnit:duplicate.ageUnit,city:duplicate.city,patientType:duplicate.patientType,address:duplicate.address||"",opdCharges:duplicate.opdCharges,opdCashPaid:p.cashPaid,opdOnlinePaid:p.onlinePaid,opdTotalPaid:p.totalPaid,nextFollowupCity:duplicate.nextFollowupCity};
    }

    const sheet = getOrCreateSheet_(ss, city);
    const dateString = requestedDate;
    const serial = getNextSerial_(sheet, dateString);

    const appointmentId =
      city + "-" + dateString + "-" + pad2_(serial);

    const row = [
      appointmentId,
      dateString,
      new Date(),
      name,
      formatAge_(age, ageUnit),
      address,
      patientType,
      phone,
      city,
      referredBy,
      validatedNextFollowupCity,
      opdCharges,
      opdPayment.cashPaid,
      opdPayment.onlinePaid,
      "",
      "",
      "",
      requestId,
      "",
      "",
      "",
      ""
    ];

    /*
     * Newest appointment stays directly below the header.
     * If the row insertion/write fails, remove the inserted row so a
     * failed request can never leave an empty patient row behind.
     */
    sheet.insertRowAfter(1);
    try {
      sheet.getRange(2, 1, 1, HEADERS.length).setValues([row]);

      // Google Sheets may inherit the header row's formatting when a new
      // row is inserted immediately below row 1. Explicitly reset the
      // newly created patient row so only row 1 remains purple.
      formatInsertedRow_(sheet, 2);
    } catch (writeError) {
      try { sheet.deleteRow(2); } catch (cleanupError) {}
      throw writeError;
    }

    return {
      ok: true,
      alreadyRecorded: false,
      appointmentId: appointmentId,
      date: dateString,
      patientName: name,
      age: age,
      ageUnit: ageUnit,
      city: city,
      patientType: patientType,
      address: address,
      opdCharges: opdCharges,
      opdCashPaid: opdPayment.cashPaid,
      opdOnlinePaid: opdPayment.onlinePaid,
      opdTotalPaid: opdPayment.totalPaid,
      nextFollowupCity: validatedNextFollowupCity
    };

  } finally {
    lock.releaseLock();
  }
}


function checkBookingRequest_(data) {
  const requestId = clean_(data.bookingRequestId);
  const city = data.city ? normalizeCity_(data.city) : "";

  if (!requestId) {
    throw new Error("Booking request ID is missing.");
  }

  const found = findBookingRequest_(
    SpreadsheetApp.getActiveSpreadsheet(),
    requestId,
    city
  );

  if (!found) {
    return {
      ok: true,
      found: false
    };
  }

  return {
    ok: true,
    found: true,
    appointmentId: found.appointmentId,
    date: found.date,
    patientName: found.patientName,
    age: found.age,
    ageUnit: found.ageUnit,
    city: found.city,
    patientType: found.patientType,
    address: found.address || "",
    opdCharges: found.opdCharges,
    opdCashPaid: found.opdCashPaid,
    opdOnlinePaid: found.opdOnlinePaid,
    opdTotalPaid: found.opdTotalPaid,
    nextFollowupCity: found.nextFollowupCity || ""
  };
}


function findBookingRequest_(ss, requestId, city) {
  return findRequestRow_(ss, 18, requestId, function(row, city) {
    return {
      appointmentId: row[0],
      date: row[1],
      patientName: row[3],
      age: parseAgeValue_(row[4]),
      ageUnit: parseAgeUnit_(row[4]),
      city: row[8] || city,
      patientType: row[6],
      reason: "",
      referredBy: row[9],
      address: row[5] || "",
      whatsapp: normalizePhone_(row[7]),
      opdCharges: row[11],
      eegCharges: row[14],
      bookingRequestId: row[17],
      eegBookingRequestId: row[18],
      bookingTimestamp: row[2],
      nextFollowupCity: row[10] || "",
      opdCashPaid: row[12],
      opdOnlinePaid: row[13],
      opdTotalPaid: (Number(row[12])||0) + (Number(row[13])||0)
    };
  });
}


/* ============================================================================
   EEG BOOKING - IDEMPOTENT
   ========================================================================== */

function defaultEEGChargesForCity_(city) {
  return String(city).toLowerCase() === "latur"
    ? DEFAULT_EEG_CHARGES_LATUR
    : DEFAULT_EEG_CHARGES;
}

function bookEEG_(data) {
  const requestId = clean_(data.eegBookingRequestId);
  const appointmentId = clean_(data.appointmentId);
  const phone = normalizePhone_(data.whatsapp);
  const city = normalizeCity_(data.city);

  const eegCharges =
    data.eegCharges === "" || data.eegCharges == null
      ? defaultEEGChargesForCity_(city)
      : Number(data.eegCharges);

  if (!requestId) {
    throw new Error("EEG request ID is missing. Please try again.");
  }

  if (!appointmentId) {
    throw new Error("Please select the patient before booking the EEG.");
  }

  if (!/^[6-9]\d{9}$/.test(phone)) {
    throw new Error("Invalid WhatsApp number.");
  }

  if (
    !Number.isFinite(eegCharges) ||
    eegCharges < MIN_EEG_CHARGES ||
    eegCharges > MAX_EEG_CHARGES
  ) {
    throw new Error(
      "Please provide correct Charges. EEG charges must be between ₹0 and ₹2000."
    );
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const eegPayment=normalizePayment_(data.eegPaymentMode,data.eegCashPaid,data.eegOnlinePaid,eegCharges,"EEG");

  // For EEG, the actual entered payment total is the final charge.
  // This is intentionally limited to EEG; OPD logic is untouched.
  const finalEEGCharges=Number(eegPayment.totalPaid);

  if(!Number.isFinite(finalEEGCharges) ||
     finalEEGCharges < MIN_EEG_CHARGES ||
     finalEEGCharges > MAX_EEG_CHARGES){
    throw new Error("EEG charges must be between ₹0 and ₹2000.");
  }

  /*
   * Fast idempotency check before acquiring the global lock.
   */
  const fastOriginalRequest = findEEGBookingRequest_(ss, requestId, city);
  if (fastOriginalRequest) {
    return {
      ok: true,
      found: true,
      alreadyRecorded: true,
      updated: false,
      patientName: fastOriginalRequest.patientName,
      appointmentId: fastOriginalRequest.appointmentId,
      eegCharges: fastOriginalRequest.eegCharges,
      city: fastOriginalRequest.city
    };
  }

  const lock = LockService.getScriptLock();
  /*
   * Keep the critical section short. If another booking is using the
   * script lock, fail quickly; the browser recovery logic will retry the
   * SAME request ID safely rather than making the patient wait 15 seconds.
   */
  if (!lock.tryLock(4000)) {
    throw new Error("Booking service is temporarily busy. Please retry.");
  }

  try {
    /*
     * IMPORTANT:
     * S = original EEG Booking Request ID.
     * T = latest same-day EEG charge update request ID.
     *
     * We NEVER replace M when a concession is made.
     */
    const originalRequest = findEEGBookingRequest_(ss, requestId, city);

    if (originalRequest) {
      return {
        ok: true,
        found: true,
        alreadyRecorded: true,
        updated: false,
        patientName: originalRequest.patientName,
        appointmentId: originalRequest.appointmentId,
        eegCharges: originalRequest.eegCharges,
        city: originalRequest.city
      };
    }

    const found = findPatientByAppointmentId_(ss, appointmentId, phone, city);

    if (!found) {
      throw new Error(
        "Selected patient could not be found for this WhatsApp number."
      );
    }

    const currentCharge = found.row[14];
    const hasExistingEEG =
      currentCharge !== "" &&
      currentCharge !== null &&
      currentCharge !== undefined;

    /*
     * CASE 1 — First EEG booking.
     *
     * Write O, P/Q and S only.
     * Appointment ID in A is untouched.
     */
    if (!hasExistingEEG) {
      found.sheet.getRange(found.rowNumber, 15).setValue(finalEEGCharges);
      found.sheet.getRange(found.rowNumber, 19).setValue(requestId);
      found.sheet.getRange(found.rowNumber, 16, 1, 2).setValues([[eegPayment.cashPaid,eegPayment.onlinePaid]]);


      return {
        ok: true,
        found: true,
        alreadyRecorded: false,
        updated: false,
        patientName: found.row[3],
        appointmentId: found.row[0],
        eegCharges: finalEEGCharges,
        eegPaymentMode: eegPayment.mode,
        eegCashPaid: eegPayment.cashPaid,
        eegOnlinePaid: eegPayment.onlinePaid,
        eegTotalPaid: eegPayment.totalPaid,
        city: found.row[8] || found.city
      };
    }

    /*
     * CASE 2 — EEG already exists.
     *
     * The concession window is strictly the same calendar date as
     * the original OPD/EEG booking date.
     */
    const bookingDate = normalizeBookingDateDDMMYYYY_(found.row[1]);
    const today = getTodayDDMMYYYY_();

    if (bookingDate !== today) {
      return {
        ok: true,
        found: true,
        alreadyBooked: true,
        alreadyRecorded: true,
        updated: false,
        patientName: found.row[3],
        appointmentId: found.row[0],
        eegCharges: currentCharge,
        city: found.row[8] || found.city
      };
    }

    /*
     * CASE 3 — Same-day charge update.
     *
     * If the exact update request was already processed, return the
     * current spreadsheet value. This makes a retry safe.
     */
    const previousUpdateRequest = clean_(found.row[19]);

    if (previousUpdateRequest === requestId) {
      return {
        ok: true,
        found: true,
        alreadyRecorded: true,
        updated: true,
        patientName: found.row[3],
        appointmentId: found.row[0],
        previousEEGCharges: "",
        eegCharges: found.row[14],
        city: found.row[8] || found.city
      };
    }

    /*
     * Preserve the amount already paid before applying the update.
     */
    const previousEEGCharges = found.row[14];

    found.sheet.getRange(found.rowNumber, 15).setValue(finalEEGCharges);
    found.sheet.getRange(found.rowNumber, 16, 1, 2).setValues([[eegPayment.cashPaid,eegPayment.onlinePaid]]);
    found.sheet.getRange(found.rowNumber, 20).setValue(requestId);

    return {
      ok: true,
      found: true,
      alreadyRecorded: false,
      updated: true,
      verified: true,
      patientName: found.row[3],
      appointmentId: found.row[0],
      previousEEGCharges: previousEEGCharges,
      eegCharges: finalEEGCharges,
      eegCashPaid: eegPayment.cashPaid,
      eegOnlinePaid: eegPayment.onlinePaid,
      eegTotalPaid: eegPayment.totalPaid,
      city: found.row[8] || found.city
    };

  } finally {
    lock.releaseLock();
  }
}

/* ============================================================================
   OPD CHARGE ADJUSTMENT - ADDITIVE, SAME-DAY ONLY
   This is intentionally separate from bookAppointment_() and all EEG logic.
   ========================================================================== */

function updateOPDCharges_(data) {
  requireOPDChargePassword_(data.password);

  /*
   * OPD CHARGE UPDATE — standalone implementation.
   *
   * This function intentionally does not reuse the EEG update path or
   * booking logic. It identifies the exact appointment row by:
   *   1. appointment ID
   *   2. WhatsApp number
   *   3. selected city
   *
   * Spreadsheet columns used by this function:
   *   B = Appointment Date
   *   H = WhatsApp
   *   L = OPD Charges
   *   M = OPD Cash
   *   N = OPD Online
   */
  const appointmentId = clean_(data.appointmentId);
  const phone = normalizePhone_(data.whatsapp || data.mobileNumber);
  const city = normalizeCity_(data.city);
  const requestedCharges = Number(data.opdCharges);

  if (!appointmentId) throw new Error("Appointment ID is missing.");
  if (!/^[6-9]\d{9}$/.test(phone)) throw new Error("Invalid WhatsApp number.");
  if (!city) throw new Error("City is missing.");
  if (!Number.isFinite(requestedCharges) || requestedCharges < 0 || requestedCharges > 1500) {
    throw new Error("Please provide a valid OPD charge between ₹0 and ₹2000.");
  }

  const payment = normalizePayment_(
    data.opdPaymentMode,
    data.opdCashPaid,
    data.opdOnlinePaid,
    requestedCharges,
    "OPD"
  );

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(city);
  if (!sheet) throw new Error("Selected city sheet was not found.");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    throw new Error("Charge update service is temporarily busy. Please retry.");
  }

  try {
    /*
     * Locate the exact appointment ID in the selected city only.
     * Do not depend on display-formatted date/charge values for the write.
     */
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) throw new Error("Selected patient could not be found.");

    const appointmentColumn = sheet.getRange(2, 1, lastRow - 1, 1);
    const cell = appointmentColumn
      .createTextFinder(appointmentId)
      .matchEntireCell(true)
      .matchCase(true)
      .findNext();

    if (!cell) {
      throw new Error("Selected patient could not be found for this appointment.");
    }

    const rowNumber = cell.getRow();
    const rawRow = sheet.getRange(rowNumber, 1, 1, HEADERS.length).getValues()[0];

    if (String(rawRow[0] || "").trim() !== appointmentId) {
      throw new Error("Appointment verification failed.");
    }

    if (normalizePhone_(rawRow[7]) !== phone) {
      throw new Error("WhatsApp number does not match the selected appointment.");
    }

    /*
     * Same-day restriction. Use the actual stored date in column B.
     */
    const bookingDate = normalizeBookingDateDDMMYYYY_(rawRow[1]);
    const today = getTodayDDMMYYYY_();

    if (!bookingDate || bookingDate !== today) {
      throw new Error("OPD charges can only be changed on the booking date.");
    }

    const currentCharges = rawRow[11];
    const currentPayment = getStoredPayment_(rawRow, 12, 13, currentCharges);
    const currentNumber = Number(currentCharges);

    /*
     * If everything already matches, this is an idempotent successful request.
     * No spreadsheet write is necessary.
     */
    if (
      Number.isFinite(currentNumber) &&
      currentNumber === requestedCharges &&
      currentPayment.cashPaid === payment.cashPaid &&
      currentPayment.onlinePaid === payment.onlinePaid &&
      currentPayment.totalPaid === payment.totalPaid
    ) {
      return {
        ok: true,
        found: true,
        alreadyPaid: true,
        updated: false,
        verified: true,
        patientName: rawRow[3],
        appointmentId: rawRow[0],
        previousOPDCharges: currentCharges,
        opdCharges: currentNumber,
        opdCashPaid: currentPayment.cashPaid,
        opdOnlinePaid: currentPayment.onlinePaid,
        opdTotalPaid: currentPayment.totalPaid,
        city: rawRow[8] || city
      };
    }

    const previousOPDCharges = currentCharges;

    /*
     * Single authoritative write.
     */
    sheet.getRange(rowNumber, 12).setValue(requestedCharges);
    sheet.getRange(rowNumber, 13, 1, 2).setValues([[
      payment.cashPaid,
      payment.onlinePaid
    ]]);

    SpreadsheetApp.flush();

    /*
     * Read the exact four cells back from the same row.
     */
    const verifiedCharges = Number(sheet.getRange(rowNumber, 12).getValue());
    const verifiedPayment = sheet.getRange(rowNumber, 13, 1, 2).getValues()[0];

    const verifiedCash = Number(verifiedPayment[0]);
    const verifiedOnline = Number(verifiedPayment[1]);
    const verifiedTotal = verifiedCash + verifiedOnline;

    if (
      verifiedCharges !== requestedCharges ||
      verifiedCash !== payment.cashPaid ||
      verifiedOnline !== payment.onlinePaid ||
      verifiedTotal !== payment.totalPaid
    ) {
      throw new Error("OPD charge update could not be verified in the spreadsheet.");
    }

    return {
      ok: true,
      found: true,
      alreadyPaid: false,
      updated: true,
      verified: true,
      patientName: rawRow[3],
      appointmentId: rawRow[0],
      previousOPDCharges: previousOPDCharges,
      opdCharges: verifiedCharges,
      opdCashPaid: verifiedCash,
      opdOnlinePaid: verifiedOnline,
      opdTotalPaid: verifiedTotal,
      city: rawRow[8] || city
    };
  } finally {
    lock.releaseLock();
  }
}

function getOPDChargeStatus_(data) {
  requireOPDChargePassword_(data.password);

  /*
   * OPD RETRIEVAL — use the same proven patient/date matching engine
   * already used by the Patient/EEG retrieval system.
   *
   * This is intentionally isolated to the OPD feature. It does not modify
   * booking, EEG, payment, or the OPD write/update function.
   */
  const result = getEEGPatientsByWhatsApp_(data);

  const patients = Array.isArray(result.patients) ? result.patients : [];

  return {
    ok: true,
    found: patients.length > 0,
    city: result.city || normalizeCity_(data.city),
    count: patients.length,
    patients: patients.map(function(p) {
      return {
        appointmentId: p.appointmentId,
        date: p.date,
        name: p.name,
        age: p.age,
        ageUnit: p.ageUnit,
        city: p.city,
        whatsapp: p.whatsapp,
        opdCharges: p.opdCharges,
        opdCashPaid: p.opdCashPaid,
        opdOnlinePaid: p.opdOnlinePaid,
        opdTotalPaid: p.opdTotalPaid
      };
    })
  };
}

function getEEGStatus_(data) {
  const appointmentId = clean_(data.appointmentId);
  const phone = normalizePhone_(data.whatsapp);
  const city = normalizeCity_(data.city);

  if (!appointmentId) {
    throw new Error("Appointment ID is missing.");
  }

  if (!/^[6-9]\d{9}$/.test(phone)) {
    throw new Error("Invalid WhatsApp number.");
  }

  const found = findPatientByAppointmentId_(
    SpreadsheetApp.getActiveSpreadsheet(),
    appointmentId,
    phone,
    city
  );

  if (!found) {
    return {
      ok: true,
      found: false
    };
  }

  const hasEEG =
    found.row[14] !== "" &&
    found.row[14] !== null &&
    found.row[14] !== undefined;

  return {
    ok: true,
    found: true,
    patientName: found.row[3],
    appointmentId: found.row[0],
    date: found.row[1],
    eegBooked: hasEEG,
    eegCharges: hasEEG ? found.row[14] : "",
    eegCashPaid: hasEEG ? getStoredPayment_(found.row,15,16,found.row[14]).cashPaid : 0,
    eegOnlinePaid: hasEEG ? getStoredPayment_(found.row,15,16,found.row[14]).onlinePaid : 0,
    eegTotalPaid: hasEEG ? getStoredPayment_(found.row,15,16,found.row[14]).totalPaid : 0,
    eegBookingRequestId: found.row[18] || "",
    eegUpdateRequestId: found.row[19] || "",
    city: found.row[8] || found.city
  };
}

function checkEEGBookingRequest_(data) {
  const requestId = clean_(data.eegBookingRequestId);
  const city = data.city ? normalizeCity_(data.city) : "";

  if (!requestId) {
    throw new Error("EEG booking request ID is missing.");
  }

  const found = findEEGBookingRequest_(
    SpreadsheetApp.getActiveSpreadsheet(),
    requestId,
    city
  );

  if (!found) {
    const update = findEEGUpdateRequest_(
      SpreadsheetApp.getActiveSpreadsheet(),
      requestId,
      city
    );

    if (!update) {
      return {
        ok: true,
        found: false
      };
    }

    return {
      ok: true,
      found: true,
      updated: true,
      patientName: update.patientName,
      appointmentId: update.appointmentId,
      eegCharges: update.eegCharges,
      eegCashPaid: update.eegCashPaid,
      eegOnlinePaid: update.eegOnlinePaid,
      eegTotalPaid: update.eegTotalPaid,
      city: update.city
    };
  }

  return {
    ok: true,
    found: true,
    patientName: found.patientName,
    appointmentId: found.appointmentId,
    eegCharges: found.eegCharges,
    eegCashPaid: found.eegCashPaid,
    eegOnlinePaid: found.eegOnlinePaid,
    eegTotalPaid: found.eegTotalPaid,
    city: found.city
  };
}

function findEEGUpdateRequest_(ss, requestId, city) {
  return findRequestRow_(ss, 20, requestId, function(row, city) {
    return {
      patientName: row[3],
      appointmentId: row[0],
      eegCharges: row[14],
      eegCashPaid: Number(row[15]) || 0,
      eegOnlinePaid: Number(row[16]) || 0,
      eegTotalPaid: (Number(row[15])||0) + (Number(row[16])||0),
      eegPaymentMode:
        Number(row[15]) > 0 && Number(row[16]) > 0
          ? "Cash + Online"
          : Number(row[16]) > 0
            ? "Online"
            : "Cash",
      city: row[8] || city
    };
  });
}


function findEEGBookingRequest_(ss, requestId, city) {
  return findRequestRow_(ss, 19, requestId, function(row, city) {
    const payment = getStoredPayment_(row,15,16,row[14]);
    return {
      patientName: row[3],
      appointmentId: row[0],
      eegCharges: row[14],
      eegCashPaid: payment.cashPaid,
      eegOnlinePaid: payment.onlinePaid,
      eegTotalPaid: payment.totalPaid,
      city: row[8] || city
    };
  });
}


/* ============================================================================
   PATIENT LOOKUP BY WHATSAPP
   ========================================================================== */



/**
 * EEG BOOKING CANDIDATE RETRIEVAL
 * Returns today's patients for the selected city who have NOT yet booked
 * an EEG. Kept separate from getEEGPatientsByWhatsApp_() so Update OPD and
 * Update EEG workflows retain their existing retrieval behavior.
 */
function getEEGBookingPatientsByWhatsApp_(data) {
  const result = getEEGPatientsByWhatsApp_(data);
  const patients = result.patients.filter(function(patient) {
    // Column S is exposed as eegBookingRequestId. Existing ID = already booked.
    return !String(patient.eegBookingRequestId || '').trim();
  });

  if (!patients.length) {
    throw new Error(
      "No patient awaiting EEG booking was found for this WhatsApp number in " +
      result.city + " for today (" + formatDDMMYYYYForMessage_(getTodayDDMMYYYY_()) + ")."
    );
  }

  return {ok:true, city:result.city, patients:patients};
}

/**
 * EEG UPDATE CANDIDATE RETRIEVAL
 * Returns only today's patients for the selected city who have an existing
 * EEG booking. This is intentionally separate from getEEGPatientsByWhatsApp_()
 * so Update OPD continues to see the normal patient list.
 */
function getEEGBookedPatientsByWhatsApp_(data) {
  const result = getEEGPatientsByWhatsApp_(data);
  const patients = result.patients.filter(function(patient) {
    // Column S is exposed as eegBookingRequestId. An existing request ID
    // confirms that the patient has actually booked an EEG appointment.
    return String(patient.eegBookingRequestId || '').trim() !== '';
  });

  if (!patients.length) {
    throw new Error(
      "No patient with a booked EEG appointment was found for this WhatsApp number in " +
      result.city + " for today (" + formatDDMMYYYYForMessage_(getTodayDDMMYYYY_()) + ")."
    );
  }

  return {ok:true, city:result.city, patients:patients};
}

/* ============================================================================
   FRESH EEG PATIENT RETRIEVAL
   --------------------------------------------------------------------------
   This function is intentionally independent of the older patient-retrieval
   functions. It performs only:
       selected city -> WhatsApp number -> today's appointment row
   It does not modify any booking/payment/update logic.
   ========================================================================== */

function retrieveEEGPatientFresh_(data) {
  const cityInput = String(data.city || "").trim();
  const phoneInput = String(data.whatsapp || "").trim();
  const city = normalizeFreshEEGCity_(cityInput);
  const phone = normalizeFreshEEGPhone_(phoneInput);

  if (!/^[6-9]\d{9}$/.test(phone)) {
    throw new Error("Enter a valid 10-digit WhatsApp number.");
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(city);
  if (!sheet) throw new Error("The " + city + " sheet was not found.");

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    throw new Error("No patient records are available in " + city + ".");
  }

  const today = Utilities.formatDate(new Date(), "Asia/Kolkata", "ddMMyyyy");

  /*
   * EEG RETRIEVAL — TARGETED LOOKUP ONLY.
   *
   * Do NOT read the entire city sheet and do NOT scan a fixed number of
   * rows.  Apps Script TextFinder performs the WhatsApp lookup on the
   * spreadsheet side and returns only cells matching this number.
   *
   * We then inspect today's date only for those matching rows.  The full
   * patient row is read only after a matching row is confirmed to belong
   * to TODAY.
   *
   * Search scope is therefore:
   *   selected city sheet -> WhatsApp number -> today's booking
   *
   * This function is read-only and does not alter booking/payment/update
   * behaviour anywhere else in the application.
   */
  const phoneRange = sheet.getRange(2, 8, lastRow - 1, 1);
  const phoneMatches = phoneRange
    .createTextFinder(phone)
    .matchCase(false)
    .matchEntireCell(false)
    .useRegularExpression(false)
    .findAll();

  const candidateRows = [];

  phoneMatches.forEach(function(cell) {
    const rowNumber = cell.getRow();
    const foundPhone = normalizeFreshEEGPhone_(cell.getDisplayValue());

    // TextFinder may match a substring; normalize again so only the
    // requested 10-digit WhatsApp number is accepted.
    if (foundPhone === phone) {
      candidateRows.push(rowNumber);
    }
  });

  if (!candidateRows.length) {
    throw new Error(
      "No EEG patient was found in " + city +
      " for this WhatsApp number."
    );
  }

  const todayRows = [];

  /*
   * Date filtering is performed ONLY on rows belonging to this WhatsApp
   * number.  Read just A, B and N first (appointment ID, booking date and
   * booking timestamp).  The remaining columns are loaded only for rows
   * confirmed as today's records.
   */
  candidateRows.forEach(function(rowNumber) {
    const metaRange = sheet.getRange(rowNumber, 1, 1, 3);
    const meta = metaRange.getValues()[0];
    const shown = metaRange.getDisplayValues()[0];

    const appointmentIdToday =
      freshEEGAppointmentIdContainsDate_(meta[0], today) ||
      freshEEGAppointmentIdContainsDate_(shown[0], today);

    const appointmentDateToday =
      freshEEGDateIsToday_(meta[1], today) ||
      freshEEGDateIsToday_(shown[1], today);

    const timestampToday =
      freshEEGDateIsToday_(meta[2], today) ||
      freshEEGDateIsToday_(shown[2], today);

    if (!appointmentIdToday && !appointmentDateToday && !timestampToday) {
      return;
    }

    // Only today's matching rows receive a full-row read.
    const row = sheet.getRange(rowNumber, 1, 1, HEADERS.length).getValues()[0];

    todayRows.push({
      rowNumber: rowNumber,
      row: row,
      timestamp: freshEEGTimestamp_(row[2])
    });
  });

  if (!todayRows.length) {
    throw new Error(
      "This WhatsApp number is registered in " + city +
      ", but no EEG booking for today (" +
      today.substring(0,2) + "/" + today.substring(2,4) + "/" +
      today.substring(4,8) + ") was found."
    );
  }

  todayRows.sort(function(a, b) {
    if (
      a.timestamp !== null &&
      b.timestamp !== null &&
      a.timestamp !== b.timestamp
    ) {
      return b.timestamp - a.timestamp;
    }

    return b.rowNumber - a.rowNumber;
  });

  const patients = todayRows.slice(0, 10).map(function(item) {
    const row = item.row;

    return {
      appointmentId: row[0] == null ? "" : row[0],
      date: row[1] == null ? "" : row[1],
      name: row[3] == null ? "" : row[3],
      age: freshEEGAgeValue_(row[4]),
      ageUnit: freshEEGAgeUnit_(row[4]),
      city: row[8] || city,
      patientType: row[6] || "",
      reason: "",
      referredBy: row[9] || "",
      whatsapp: phone,
      opdCharges: row[11] == null ? "" : row[11],
      opdCashPaid: Number(row[12]) || 0,
      opdOnlinePaid: Number(row[13]) || 0,
      opdTotalPaid: (Number(row[12])||0) + (Number(row[13])||0),
      eegCharges: row[14] == null ? "" : row[14],
      eegCashPaid: Number(row[15]) || 0,
      eegOnlinePaid: Number(row[16]) || 0,
      eegTotalPaid: (Number(row[15])||0) + (Number(row[16])||0),
      eegBookingRequestId: row[18] || "",
      eegUpdateRequestId: row[19] || "",
      bookingTimestamp: row[2] || "",
      nextFollowupCity: row[10] || ""
    };
  });

  return {
    ok: true,
    city: city,
    patients: patients
  };
}

function freshEEGAppointmentIdContainsDate_(value, today) {
  const id = String(value || "");
  if (!id || !today) return false;

  return id.indexOf("-" + today + "-") >= 0 ||
         id.indexOf(today) >= 0;
}

function normalizeFreshEEGCity_(value) {
  const s = String(value || "").trim().toLowerCase();

  for (let i = 0; i < SHEET_NAMES.length; i++) {
    if (SHEET_NAMES[i].toLowerCase() === s) return SHEET_NAMES[i];
  }

  throw new Error("Invalid city selected.");
}

function normalizeFreshEEGPhone_(value) {
  let s = String(value == null ? "" : value).replace(/\D/g, "");

  if (s.length === 12 && s.substring(0, 2) === "91") {
    s = s.substring(2);
  }

  return s;
}

function freshEEGDateIsToday_(value, today) {
  if (value === null || value === undefined || value === "") return false;

  // Actual Google Sheets Date object.
  if (Object.prototype.toString.call(value) === "[object Date]" &&
      !isNaN(value.getTime())) {
    return Utilities.formatDate(value, "Asia/Kolkata", "ddMMyyyy") === today;
  }

  const s = String(value).trim();
  if (!s) return false;

  const digits = s.replace(/\D/g, "");

  // DDMMYYYY
  if (digits.length === 8 && digits === today) return true;

  // YYYYMMDD
  if (digits.length === 8 &&
      digits.substring(0, 4) === today.substring(4) &&
      digits.substring(4) === today.substring(2, 4) &&
      digits.substring(6) === today.substring(0, 2)) {
    return true;
  }

  // ISO / normal parseable date.
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, "Asia/Kolkata", "ddMMyyyy") === today;
  }

  return false;
}

function freshEEGTimestamp_(value) {
  if (value === null || value === undefined || value === "") return null;

  if (Object.prototype.toString.call(value) === "[object Date]" &&
      !isNaN(value.getTime())) {
    return value.getTime();
  }

  const d = new Date(String(value));
  return isNaN(d.getTime()) ? null : d.getTime();
}

function freshEEGAgeValue_(value) {
  const s = String(value == null ? "" : value).trim();
  const m = s.match(/^([0-9]+(?:\.[0-9]+)?)/);
  return m ? m[1] : s;
}

function freshEEGAgeUnit_(value) {
  const s = String(value == null ? "" : value).toLowerCase();

  if (/\b(month|months|mo)\b/.test(s)) return "Months";
  if (/\b(day|days|d)\b/.test(s)) return "Days";
  return "Years";
}


function getEEGPatientsByWhatsApp_(data) {
  /*
   * v69 FAST RETRIEVAL:
   * Search only the WhatsApp column first. This avoids loading all 22
   * columns for every row. Once matching phone rows are identified, read
   * the complete row only for those candidates.
   *
   * This preserves v67/v68 date matching:
   *   1. Appointment ID date
   *   2. Appointment date (column B)
   *   3. Booking timestamp (column C)
   *
   * No historical fallback is needed because the phone-column scan covers
   * the complete city sheet while transferring only one column.
   */
  const phone = normalizePhone_(data.whatsapp);
  const city = normalizeCity_(data.city);

  if (!/^[6-9]\d{9}$/.test(phone)) {
    throw new Error("Invalid WhatsApp number.");
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(city);

  if (!sheet || sheet.getLastRow() < 2) {
    throw new Error("No patient records are available in the " + city + " sheet.");
  }

  const today = getTodayDDMMYYYY_();
  const lastRow = sheet.getLastRow();
  const rowCount = lastRow - 1;

  /*
   * Critical optimization:
   * Read only column H (WhatsApp) for the complete sheet.
   * A 10,000-row sheet therefore transfers 10,000 cells instead of
   * 440,000 cells (20 columns x 2 raw/display reads).
   */
  const phoneValues = sheet
    .getRange(2, 8, rowCount, 1)
    .getDisplayValues();

  const candidateRows = [];

  for (let i = 0; i < phoneValues.length; i++) {
    if (normalizePhone_(phoneValues[i][0]) === phone) {
      candidateRows.push(i + 2);
    }
  }

  if (!candidateRows.length) {
    throw new Error(
      "No patient was found with this WhatsApp number in " + city + "."
    );
  }

  const todayRows = [];

  /*
   * Only matching phone rows are expanded to the full patient record.
   * Usually this is 1–2 rows, even when the sheet contains thousands
   * of historical records.
   */
  candidateRows.forEach(function(rowNumber) {
    const range = sheet.getRange(rowNumber, 1, 1, HEADERS.length);
    const row = range.getValues()[0];
    const shown = range.getDisplayValues()[0];

    const appointmentIdToday =
      appointmentIdContainsDate_(row[0], today) ||
      appointmentIdContainsDate_(shown[0], today);

    const appointmentDateToday =
      normalizeAnyBookingDateDDMMYYYY_(row[1]) === today ||
      normalizeAnyBookingDateDDMMYYYY_(shown[1]) === today;

    const timestampToday =
      normalizeAnyBookingDateDDMMYYYY_(row[2]) === today ||
      normalizeAnyBookingDateDDMMYYYY_(shown[2]) === today;

    if (!appointmentIdToday && !appointmentDateToday && !timestampToday) {
      return;
    }

    todayRows.push({
      row: row,
      rowNumber: rowNumber,
      bookingTimestampMs: getTimestampMs_(row[2])
    });
  });

  if (!todayRows.length) {
    throw new Error(
      "This WhatsApp number is registered in " + city +
      ", but no booking for today (" + formatDDMMYYYYForMessage_(today) +
      ") was found."
    );
  }

  todayRows.sort(function(a, b) {
    const at = a.bookingTimestampMs;
    const bt = b.bookingTimestampMs;

    if (at !== null || bt !== null) {
      if (at === null) return 1;
      if (bt === null) return -1;
      if (bt !== at) return bt - at;
    }

    return b.rowNumber - a.rowNumber;
  });

  return {
    ok: true,
    city: city,
    patients: todayRows.map(function(found) {
      const row = found.row;
      const opdPayment = getStoredPayment_(row, 12, 13, row[11]);
      const eegPayment = row[14] !== ""
        ? getStoredPayment_(row, 15, 16, row[14])
        : {cashPaid:0, onlinePaid:0, totalPaid:0};

      return {
        appointmentId: row[0],
        date: row[1],
        name: row[3],
        age: parseAgeValue_(row[4]),
        ageUnit: parseAgeUnit_(row[4]),
        address: row[5] || "",
        city: row[8] || city,
        patientType: row[6],
        reason: "",
        referredBy: row[9],
        whatsapp: normalizePhone_(row[7]),
        opdCharges: row[11],
        opdCashPaid: opdPayment.cashPaid,
        opdOnlinePaid: opdPayment.onlinePaid,
        opdTotalPaid: opdPayment.totalPaid,
        eegCharges: row[14],
        eegCashPaid: eegPayment.cashPaid,
        eegOnlinePaid: eegPayment.onlinePaid,
        eegTotalPaid: eegPayment.totalPaid,
        eegBookingRequestId: row[18] || "",
        eegUpdateRequestId: row[19] || "",
        bookingTimestamp: row[2] || "",
        nextFollowupCity: row[10] || ""
      };
    })
  };
}

function appointmentIdContainsDate_(appointmentId, todayDDMMYYYY) {
  const id = String(appointmentId || "");
  if (!id || !todayDDMMYYYY) return false;

  // Current format: CITY-DDMMYYYY-SERIAL
  if (id.indexOf("-" + todayDDMMYYYY + "-") !== -1) return true;

  // Defensive fallback in case a legacy ID contains the date elsewhere.
  return id.indexOf(todayDDMMYYYY) !== -1;
}


function formatDDMMYYYYForMessage_(value) {
  const s = String(value || "");
  if (/^\d{8}$/.test(s)) {
    return s.substring(0,2) + "/" +
           s.substring(2,4) + "/" +
           s.substring(4,8);
  }
  return s;
}


function getPatientByWhatsApp_(data) {
  /*
   * Backward-compatible entry point.
   * EEG patient retrieval uses the same deterministic implementation:
   * selected city + WhatsApp number + today's booking.
   */
  return getEEGPatientsByWhatsApp_(data);
}



function findPatientsByWhatsAppInCityAndDate_(ss, city, phone, today) {
  const sheet = ss.getSheetByName(city);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const lastRow = sheet.getLastRow();
  const rowCount = lastRow - 1;

  // Read both raw values and displayed values. Google Sheets can return
  // the same date as a Date object, formatted text, or a timestamp string.
  // Using both representations prevents a valid same-day patient from
  // being rejected because of the cell's number/date format.
  const range = sheet.getRange(2, 1, rowCount, HEADERS.length);
  const values = range.getValues();
  const display = range.getDisplayValues();
  const matches = [];

  values.forEach(function(row, index) {
    const rowNumber = index + 2;
    const shown = display[index];

    // Match the phone using both raw and displayed cell values.
    const rawPhone = normalizePhone_(row[7]);
    const shownPhone = normalizePhone_(shown[7]);
    if (rawPhone !== phone && shownPhone !== phone) return;

    // Primary date: appointment date in column B.
    const rawBookingDate = normalizeAnyBookingDateDDMMYYYY_(row[1]);
    const shownBookingDate = normalizeAnyBookingDateDDMMYYYY_(shown[1]);

    // Secondary date: booking timestamp in column C. This is the actual
    // server-side booking time and is used as a safe fallback if column B
    // has an unusual Sheets date/text representation.
    const rawTimestampDate = normalizeAnyBookingDateDDMMYYYY_(row[2]);
    const shownTimestampDate = normalizeAnyBookingDateDDMMYYYY_(shown[2]);

    const bookingDateIsToday =
      rawBookingDate === today || shownBookingDate === today;

    const timestampIsToday =
      rawTimestampDate === today || shownTimestampDate === today;

    if (!bookingDateIsToday && !timestampIsToday) return;

    matches.push({
      sheet: sheet,
      rowNumber: rowNumber,
      row: row,
      city: city,
      bookingTimestampMs: getTimestampMs_(row[2]),
      rowIndex: rowNumber - 2
    });
  });

  matches.sort(function(a, b) {
    const at = a.bookingTimestampMs;
    const bt = b.bookingTimestampMs;

    if (at !== null || bt !== null) {
      if (at === null) return 1;
      if (bt === null) return -1;
      if (bt !== at) return bt - at;
    }

    return a.rowIndex - b.rowIndex;
  });

  return matches;
}

/*
 * Legacy city + WhatsApp lookup retained for compatibility.
 */
function findPatientsByWhatsAppInCity_(ss, city, phone) {
  const sheet = ss.getSheetByName(city);

  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }

  const lastRow = sheet.getLastRow();
  const rowCount = Math.min(ACTIVE_SEARCH_ROWS, lastRow - 1);
  const values = sheet
    .getRange(2, 1, rowCount, HEADERS.length)
    .getValues();

  const matches = [];

  values.forEach(function(row, index) {
    if (normalizePhone_(row[7]) !== phone) return;

    matches.push({
      sheet: sheet,
      rowNumber: index + 2,
      row: row,
      city: city,
      bookingTimestampMs: getTimestampMs_(row[2]),
      rowIndex: index
    });
  });

  matches.sort(function(a, b) {
    const at = a.bookingTimestampMs;
    const bt = b.bookingTimestampMs;

    if (at !== null || bt !== null) {
      if (at === null) return 1;
      if (bt === null) return -1;
      if (bt !== at) return bt - at;
    }

    const ad = appointmentDateScore_(a.row[1]);
    const bd = appointmentDateScore_(b.row[1]);

    if (bd !== ad) return bd - ad;

    return a.rowIndex - b.rowIndex;
  });

  return matches;
}

/*
 * Return ALL OPD records belonging to the WhatsApp number.
 *
 * This deliberately searches every city sheet because one parent may use
 * the same mobile number for multiple children and may have appointments
 * at different cities.
 *
 * New records have an exact Booking Timestamp in column C, so they are
 * sorted newest-first across cities. Older records without a timestamp
 * fall back to appointment date, sheet row order and appointment ID.
 */
function findPatientsByWhatsApp_(ss, phone, scheduledCities) {
  const scheduled = Array.isArray(scheduledCities) ? scheduledCities : [];
  const scheduledSet = new Set(scheduled.map(normalizeCity_));

  // Scheduled cities first, then every remaining city.
  const orderedCities = [];
  scheduled.forEach(function(city) {
    const c=normalizeCity_(city);
    if(c && !orderedCities.includes(c)) orderedCities.push(c);
  });
  SHEET_NAMES.forEach(function(city) {
    const c=normalizeCity_(city);
    if(c && !orderedCities.includes(c)) orderedCities.push(c);
  });

  const groups=[];
  const allMatches=[];

  orderedCities.forEach(function(city) {
    const sheet=ss.getSheetByName(city);
    if(!sheet || sheet.getLastRow()<2) return;

    // Follow-up retrieval intentionally searches ALL data rows.
    // Newest bookings are physically near row 2, but older records must
    // remain discoverable as well.
    const lastRow=sheet.getLastRow();
    const values=sheet.getRange(2,1,lastRow-1,HEADERS.length).getValues();
    const matches=[];

    values.forEach(function(row,index){
      if(normalizePhone_(row[7])!==phone) return;
      matches.push({
        sheet:sheet,
        rowNumber:index+2,
        row:row,
        city:city,
        bookingTimestampMs:getTimestampMs_(row[2]),
        rowIndex:index
      });
    });

    matches.sort(function(a,b){
      const at=a.bookingTimestampMs, bt=b.bookingTimestampMs;
      if(at!==null || bt!==null){
        if(at===null)return 1;
        if(bt===null)return -1;
        if(bt!==at)return bt-at;
      }
      const ad=appointmentDateScore_(a.row[1]);
      const bd=appointmentDateScore_(b.row[1]);
      if(bd!==ad)return bd-ad;
      if(a.rowIndex!==b.rowIndex)return a.rowIndex-b.rowIndex;
      return String(b.row[0]||"").localeCompare(String(a.row[0]||""));
    });

    if(matches.length){
      groups.push({
        city:city,
        scheduledToday:scheduledSet.has(city),
        matches:matches
      });
      matches.forEach(m=>allMatches.push(m));
    }
  });

  // Groups are already ordered by schedule priority and then SHEET_NAMES.
  // Within every city, newest booking is first.
  return {matches:allMatches,groups:groups};
}

/* Find one exact OPD record for EEG booking for EEG booking. */
function findPatientByAppointmentId_(ss, appointmentId, phone, city) {
  const cities = city ? [city] : SHEET_NAMES;

  for (let i = 0; i < cities.length; i++) {
    const sheetCity = cities[i];
    const sheet = ss.getSheetByName(sheetCity);

    if (!sheet || sheet.getLastRow() < 2) continue;

    const lastRow = sheet.getLastRow();
    const activeCount = Math.min(ACTIVE_SEARCH_ROWS, lastRow - 1);

    let cell = sheet
      .getRange(2, 1, activeCount, 1)
      .createTextFinder(appointmentId)
      .matchEntireCell(true)
      .matchCase(true)
      .findNext();

    if (!cell && lastRow - 1 > ACTIVE_SEARCH_ROWS) {
      cell = sheet
        .getRange(ACTIVE_SEARCH_ROWS + 2, 1,
                  lastRow - (ACTIVE_SEARCH_ROWS + 1), 1)
        .createTextFinder(appointmentId)
        .matchEntireCell(true)
        .matchCase(true)
        .findNext();
    }

    if (!cell) continue;

    const rowNumber = cell.getRow();
    const row = sheet
      .getRange(rowNumber, 1, 1, HEADERS.length)
      .getDisplayValues()[0];

    if (String(row[0] || "").trim() !== appointmentId) continue;
    if (normalizePhone_(row[7]) !== phone) continue;

    return {
      sheet: sheet,
      rowNumber: rowNumber,
      row: row,
      city: sheetCity
    };
  }

  return null;
}

function findRequestRow_(ss, columnNumber, requestId, mapper, city) {
  if (!requestId) return null;

  const cities = city ? [city] : SHEET_NAMES;

  for (let i = 0; i < cities.length; i++) {
    const sheetCity = cities[i];
    const sheet = ss.getSheetByName(sheetCity);

    if (!sheet || sheet.getLastRow() < 2) continue;

    const lastRow = sheet.getLastRow();
    const activeCount = Math.min(ACTIVE_SEARCH_ROWS, lastRow - 1);

    /*
     * Fast path: search only the newest active records.
     */
    let cell = sheet
      .getRange(2, columnNumber, activeCount, 1)
      .createTextFinder(requestId)
      .matchEntireCell(true)
      .matchCase(true)
      .findNext();

    /*
     * Rare fallback: if an old request ID is being checked after the
     * active window has moved past it, search the historical portion.
     * This preserves the original idempotency guarantee.
     */
    if (!cell && lastRow - 1 > ACTIVE_SEARCH_ROWS) {
      cell = sheet
        .getRange(ACTIVE_SEARCH_ROWS + 2, columnNumber,
                  lastRow - (ACTIVE_SEARCH_ROWS + 1), 1)
        .createTextFinder(requestId)
        .matchEntireCell(true)
        .matchCase(true)
        .findNext();
    }

    if (!cell) continue;

    const rowNumber = cell.getRow();
    const row = sheet
      .getRange(rowNumber, 1, 1, HEADERS.length)
      .getDisplayValues()[0];

    if (String(row[columnNumber - 1] || "").trim() !== requestId) continue;

    return mapper(row, sheetCity);
  }

  return null;
}

function getTimestampMs_(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  /*
   * Booking Timestamp can arrive from Google Sheets as a real Date object
   * OR as text such as "24/08/2026 15:07:09". JavaScript's Date parser is
   * not reliable for DD/MM/YYYY text, so parse that format explicitly.
   * This is important for Follow-up ordering: an unparseable timestamp
   * must not silently fall back to spreadsheet row order.
   */
  if (Object.prototype.toString.call(value) === "[object Date]") {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    // Defensive support for a Google Sheets serial-date value.
    const ms = Math.round((value - 25569) * 86400000);
    return Number.isFinite(ms) ? ms : null;
  }

  const s = String(value).trim();
  if (!s) return null;

  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    const hour = Number(m[4] || 0);
    const minute = Number(m[5] || 0);
    const second = Number(m[6] || 0);

    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 &&
        hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 &&
        second >= 0 && second <= 59) {
      return Date.UTC(year, month - 1, day, hour, minute, second);
    }
  }

  // ISO/other parseable formats remain supported for compatibility.
  const ms = new Date(s).getTime();
  return Number.isFinite(ms) ? ms : null;
}


function appointmentDateScore_(value) {
  const s = String(value || "").replace(/\D/g, "");
  if (s.length !== 8) return 0;

  /* DDMMYYYY -> YYYYMMDD numeric score. */
  return Number(s.slice(4) + s.slice(2, 4) + s.slice(0, 2));
}




/* ============================================================================
   SECURE PATIENT / EEG RETRIEVAL SYSTEM
   ========================================================================== */

/*
 * Administrative retrieval is deliberately isolated from the booking path.
 * It is read-only and never writes to patient sheets.
 *
 * Filters supported by the frontend:
 *   today     = today's Indian calendar date
 *   yesterday = yesterday's Indian calendar date
 *   YYYY-MM   = the complete calendar month
 *
 * showMode:
 *   patient = all OPD/patient records in the period
 *   eeg     = only rows with EEG Charges
 *   both    = all patient rows with both charge columns
 */
function requireOPDChargePassword_(password) {
  if (String(password == null ? "" : password) !== OPD_CHARGE_PASSWORD) {
    throw new Error("Incorrect password.");
  }
}

function retrieveRecords_(data) {

  const requestedCity = clean_(data.city);
  const period = clean_(data.period || "today").toLowerCase();
  const showMode = clean_(data.showMode || "both").toLowerCase();

  if (!["today", "yesterday", "daybefore", "currentyear", "lastyear", "last6", "last12"].includes(period) &&
      !/^\d{4}-\d{2}$/.test(period)) {
    throw new Error("Invalid retrieval date selection.");
  }

  if (!["patient", "eeg", "both"].includes(showMode)) {
    throw new Error("Invalid retrieval display mode.");
  }

  let city = "";
  if (requestedCity.toLowerCase() === "all") {
    city = "All";
  } else {
    city = normalizeCity_(requestedCity);
  }

  const range = getRetrievalDateRange_(period);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = city === "All"
    ? SHEET_NAMES.map(function(name) {
        return ss.getSheetByName(name);
      }).filter(function(sheet) {
        return sheet && sheet.getLastRow() >= 2;
      })
    : [ss.getSheetByName(city)].filter(function(sheet) {
        return sheet && sheet.getLastRow() >= 2;
      });

  if (!sheets.length) {
    return {
      ok: true,
      city: city,
      period: period,
      periodLabel: range.label,
      showMode: showMode,
      rows: [],
      totals: { patientCount:0,eegCount:0,opdTotal:0,opdCash:0,opdOnline:0,opdPaid:0,eegTotal:0,eegCash:0,eegOnline:0,eegPaid:0 }
    };
  }

  const rows = [];

  /*
   * v49 retrieval optimization:
   * First read ONLY column B (the booking date). Once the matching row
   * numbers are known, read the complete 15-column records only for those
   * rows. This preserves exactly the same filtering/output while avoiding
   * transferring every column for every historical row when a narrow period
   * such as Today, Yesterday, or one month is selected.
   *
   * For Last 6/12 Months most rows may match, so the benefit naturally
   * decreases; correctness is unchanged.
   */
  sheets.forEach(function(sheet) {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    const rowCount = lastRow - 1;
    // Read both the booking-date column (B) and the authoritative
    // server booking-timestamp column (C). Around midnight, an older
    // deployment may have stored column B as the previous calendar day
    // even though the actual booking timestamp is already today.
    // Patient/OPD retrieval already treats column C as a same-day
    // fallback; Patient / EEG Retrieval must use the same rule.
    const dateValues = sheet
      .getRange(2, 2, rowCount, 2)
      .getDisplayValues();

    const matchingRows = [];

    dateValues.forEach(function(cell, index) {
      const bookingDate = normalizeDisplayedBookingDateDDMMYYYY_(cell[0]);
      const timestampDate = normalizeDisplayedBookingDateDDMMYYYY_(cell[1]);
      const bookingKey = retrievalSortableDate_(bookingDate);
      const timestampKey = retrievalSortableDate_(timestampDate);

      const bookingMatches = bookingKey &&
        bookingKey >= range.startKey && bookingKey <= range.endKey;
      const timestampMatches = timestampKey &&
        timestampKey >= range.startKey && timestampKey <= range.endKey;

      if (!bookingMatches && !timestampMatches) return;

      matchingRows.push({
        rowNumber: index + 2,
        storedDate: bookingMatches ? bookingDate : timestampDate,
        sortableDate: bookingMatches ? bookingKey : timestampKey
      });
    });

    if (!matchingRows.length) return;

    /*
     * Matching rows are normally contiguous because new bookings are kept
     * newest-first. Still, build contiguous blocks rather than assuming
     * perfect ordering; this keeps retrieval correct after manual edits.
     */
    let blockStart = matchingRows[0].rowNumber;
    let blockEnd = blockStart;

    function readBlock(startRow, endRow) {
      const block = sheet
        .getRange(startRow, 1, endRow - startRow + 1, HEADERS.length)
        .getDisplayValues();

      block.forEach(function(row) {
        const storedDate = normalizeDisplayedBookingDateDDMMYYYY_(row[1]);
        const timestampDate = normalizeDisplayedBookingDateDDMMYYYY_(row[2]);
        const sortableDate = retrievalSortableDate_(storedDate);
        const timestampSortableDate = retrievalSortableDate_(timestampDate);

        const bookingMatches = sortableDate &&
          sortableDate >= range.startKey && sortableDate <= range.endKey;
        const timestampMatches = timestampSortableDate &&
          timestampSortableDate >= range.startKey && timestampSortableDate <= range.endKey;

        if (!bookingMatches && !timestampMatches) {
          return;
        }

        // If column B is stale because of a midnight-boundary write,
        // expose the actual booking date represented by column C.
        const effectiveDate = bookingMatches ? storedDate : timestampDate;

        const patientName = clean_(row[3]);
        const mobile = normalizePhone_(row[7]);
        const opdCharges = parseCharge_(row[11]);
        const eegCharges = parseCharge_(row[14]);
        const hasEEG = eegCharges !== null;
        const opdPay=getStoredPayment_(row,12,13,opdCharges===null?0:opdCharges);
        const eegPay=hasEEG?getStoredPayment_(row,15,16,eegCharges):{cashPaid:0,onlinePaid:0,totalPaid:0};

        if (showMode === "eeg" && !hasEEG) return;

        rows.push({
          patientName: patientName,
          age: row[4],
          ageUnit: "",
          opdCharges: opdCharges===null?0:opdCharges,
          opdCashPaid:opdPay.cashPaid, opdOnlinePaid:opdPay.onlinePaid, opdTotalPaid:opdPay.totalPaid,
          eegCharges:hasEEG?eegCharges:null,
          eegCashPaid:eegPay.cashPaid, eegOnlinePaid:eegPay.onlinePaid, eegTotalPaid:eegPay.totalPaid,
          mobileNumber:mobile,
          date: effectiveDate,
          appointmentId: clean_(row[0]),
          city: sheet.getName(),
          // Next Followup City exists in column K (index 10). It is
          // intentionally returned only for Latur retrieval. Other cities
          // keep the existing retrieval payload unchanged.
          followupCity: sheet.getName() === "Latur" ? clean_(row[10]) : ""
        });
      });
    }

    for (let i = 1; i < matchingRows.length; i++) {
      const rowNumber = matchingRows[i].rowNumber;
      if (rowNumber === blockEnd + 1) {
        blockEnd = rowNumber;
      } else {
        readBlock(blockStart, blockEnd);
        blockStart = rowNumber;
        blockEnd = rowNumber;
      }
    }

    readBlock(blockStart, blockEnd);
  });

  // Preserve existing newest-date-first output ordering.
  rows.sort(function(a, b) {
    const ad = retrievalSortableDate_(a.date);
    const bd = retrievalSortableDate_(b.date);
    if (ad !== bd) return bd.localeCompare(ad);
    return 0;
  });

  let opdTotal=0,opdCash=0,opdOnline=0,opdPaid=0;
  let eegTotal=0,eegCash=0,eegOnline=0,eegPaid=0,eegCount=0;

  rows.forEach(function(r) {
    opdTotal+=Number(r.opdCharges)||0; opdCash+=Number(r.opdCashPaid)||0; opdOnline+=Number(r.opdOnlinePaid)||0; opdPaid+=Number(r.opdTotalPaid)||0;
    if(r.eegCharges!==null){eegTotal+=Number(r.eegCharges)||0;eegCash+=Number(r.eegCashPaid)||0;eegOnline+=Number(r.eegOnlinePaid)||0;eegPaid+=Number(r.eegTotalPaid)||0;eegCount++;}
  });

  return {
    ok: true,
    city: city,
    period: period,
    periodLabel: range.label,
    showMode: showMode,
    rows: rows,
    totals: {
      patientCount: rows.length,
      eegCount: eegCount,
      opdTotal:opdTotal, opdCash:opdCash, opdOnline:opdOnline, opdPaid:opdPaid,
      eegTotal:eegTotal, eegCash:eegCash, eegOnline:eegOnline, eegPaid:eegPaid
    }
  };
}

/* ============================================================================
   RETRIEVAL CACHE SYNCHRONIZATION
   --------------------------------------------------------------------------
   The browser keeps the synchronized rows in IndexedDB. Google Sheets remains
   authoritative. This endpoint only returns read-only Today/Yesterday data
   for the retrieval portal.
   ========================================================================== */
function syncRetrievalCache_(data) {

  const requestedPeriods = Array.isArray(data.periods) && data.periods.length
    ? data.periods
    : ["today", "yesterday"];

  const periods = requestedPeriods
    .map(function(p){ return clean_(p).toLowerCase(); })
    .filter(function(p){
      return p === "today" || p === "yesterday";
    });

  if (!periods.length) {
    throw new Error("No valid synchronization periods were supplied.");
  }

  const datasets = periods.map(function(period){
    return retrieveRecords_({
      city: "All",
      period: period,
      showMode: "both"
    });
  });

  return {
    ok: true,
    source: "Google Sheets",
    syncedAt: new Date().toISOString(),
    datasets: datasets
  };
}


function getRetrievalDateRange_(period) {
  const now = new Date();
  const tz = "Asia/Kolkata";

  function dateFromDDMMYYYY_(ddmmyyyy) {
    const d = Number(ddmmyyyy.slice(0, 2));
    const m = Number(ddmmyyyy.slice(2, 4)) - 1;
    const y = Number(ddmmyyyy.slice(4, 8));

    // Keep the calendar date independent of the Apps Script project
    // timezone. This prevents a date selected at/around midnight IST
    // from shifting to the previous calendar day.
    return new Date(Date.UTC(y, m, d));
  }

  function fmt(date) {
    return Utilities.formatDate(date, tz, "ddMMyyyy");
  }

  function key(date) {
    return Utilities.formatDate(date, tz, "yyyyMMdd");
  }

  function monthLabel(first, last, prefix) {
    const firstLabel = Utilities.formatDate(first, tz, "MMMM yyyy");
    const lastLabel = Utilities.formatDate(last, tz, "MMMM yyyy");
    return prefix
      ? prefix + " (" + firstLabel + " – " + lastLabel + ")"
      : firstLabel;
  }

  if (period === "today") {
    const d = dateFromDDMMYYYY_(Utilities.formatDate(now, tz, "ddMMyyyy"));
    return {
      start: fmt(d),
      end: fmt(d),
      startKey: key(d),
      endKey: key(d),
      label: "Today"
    };
  }

  if (period === "yesterday") {
    const d = dateFromDDMMYYYY_(Utilities.formatDate(now, tz, "ddMMyyyy"));
    d.setUTCDate(d.getUTCDate() - 1);
    return {
      start: fmt(d),
      end: fmt(d),
      startKey: key(d),
      endKey: key(d),
      label: "Yesterday"
    };
  }

  if (period === "daybefore") {
    const d = dateFromDDMMYYYY_(Utilities.formatDate(now, tz, "ddMMyyyy"));
    d.setUTCDate(d.getUTCDate() - 2);
    return {
      start: fmt(d),
      end: fmt(d),
      startKey: key(d),
      endKey: key(d),
      label: "Day Before Yesterday"
    };
  }

  const currentYear = Number(Utilities.formatDate(now, tz, "yyyy"));
  const currentMonth = Number(Utilities.formatDate(now, tz, "M"));

  let year;
  let month;

  if (/^\d{4}-\d{2}$/.test(period)) {
    year = Number(period.slice(0, 4));
    month = Number(period.slice(5, 7));

    if (month < 1 || month > 12) {
      throw new Error("Invalid retrieval month.");
    }

    const first = new Date(Date.UTC(year, month - 1, 1));
    const last = new Date(Date.UTC(year, month, 0));

    return {
      start: fmt(first),
      end: fmt(last),
      startKey: key(first),
      endKey: key(last),
      label: Utilities.formatDate(first, tz, "MMMM yyyy")
    };
  }

  if (period === "currentyear") {
    const first = new Date(Date.UTC(currentYear, 0, 1));
    const last = new Date(Date.UTC(currentYear, 11, 31));
    return {
      start: fmt(first),
      end: fmt(last),
      startKey: key(first),
      endKey: key(last),
      label: String(currentYear)
    };
  }

  if (period === "lastyear") {
    const first = new Date(Date.UTC(currentYear - 1, 0, 1));
    const last = new Date(Date.UTC(currentYear - 1, 11, 31));
    return {
      start: fmt(first),
      end: fmt(last),
      startKey: key(first),
      endKey: key(last),
      label: String(currentYear - 1)
    };
  }

  if (period === "last6" || period === "last12") {
    const count = period === "last6" ? 6 : 12;
    const first = new Date(Date.UTC(currentYear, currentMonth - 1 - (count - 1), 1));
    const last = new Date(Date.UTC(currentYear, currentMonth, 0));

    return {
      start: fmt(first),
      end: fmt(last),
      startKey: key(first),
      endKey: key(last),
      label: monthLabel(
        first,
        last,
        period === "last6" ? "Last 6 Months Combined" : "Last 1 Year Combined"
      )
    };
  }

  throw new Error("Invalid retrieval date selection.");
}


function retrievalSortableDate_(ddmmyyyy) {
  const raw = String(ddmmyyyy || "");
  if (!/^\d{8}$/.test(raw)) return "";

  // DDMMYYYY -> YYYYMMDD, which sorts correctly chronologically.
  return raw.slice(4, 8) + raw.slice(2, 4) + raw.slice(0, 2);
}

function parseCharge_(value) {
  const raw = String(value == null ? "" : value).trim();
  if (!raw) return null;

  const n = Number(raw.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}


/* ============================================================================
   VALIDATION / SHEET HELPERS
   ========================================================================== */

function validateAppointment_(
  name, age, ageUnit, phone, patientType, opdCharges
) {
  if (!name) {
    throw new Error("Patient name is required.");
  }

  if (!Number.isFinite(age) || age < 0) {
    throw new Error("Valid age is required.");
  }

  if (!["days", "months", "years"].includes(ageUnit)) {
    throw new Error("Invalid age unit.");
  }

  if (!/^[6-9]\d{9}$/.test(phone)) {
    throw new Error("Invalid WhatsApp number.");
  }

  if (!["New", "Follow-up"].includes(patientType)) {
    throw new Error("Invalid patient type.");
  }

  if (!Number.isFinite(opdCharges) || opdCharges < 0 || opdCharges > 2000) {
    throw new Error("OPD charges must be between ₹0 and ₹2000.");
  }
}


function validateNextFollowupCity_(city) {
  const value = clean_(city);

  if (!value) {
    throw new Error("Next Followup City is required for Latur OPD bookings.");
  }

  if (SHEET_NAMES.indexOf(value) === -1) {
    throw new Error("Invalid Next Followup City.");
  }

  return value;
}

function normalizeCity_(city) {
  const raw = clean_(city);

  const match = SHEET_NAMES.find(function(name) {
    return name.toLowerCase() === raw.toLowerCase();
  });

  if (!match) {
    throw new Error("Invalid visit location.");
  }

  return match;
}


function normalizePhone_(phone) {
  let p = String(phone == null ? "" : phone)
    .replace(/\D/g, "");

  if (p.length === 12 && p.indexOf("91") === 0) {
    p = p.substring(2);
  }

  return p;
}


function formatAge_(age, unit) {
  const n = Number(age);

  if (Number.isInteger(n)) {
    return String(n) + " " + unit;
  }

  return String(Number(n.toFixed(1))) + " " + unit;
}


function parseAgeValue_(ageWithUnit) {
  const m = String(ageWithUnit || "")
    .trim()
    .match(/^([0-9]+(?:\.[0-9]+)?)/);

  return m ? Number(m[1]) : "";
}


function parseAgeUnit_(ageWithUnit) {
  const s = String(ageWithUnit || "").toLowerCase();

  if (s.indexOf("day") >= 0) return "days";
  if (s.indexOf("month") >= 0) return "months";
  if (s.indexOf("year") >= 0) return "years";

  return "";
}


/*
 * Normalize the DISPLAYED value from Google Sheets column B.
 * This is deliberately separate from normalizeBookingDateDDMMYYYY_()
 * because getDisplayValues() can return either DDMMYYYY text or
 * DD/MM/YYYY depending on the sheet's number format.
 */
function normalizeDisplayedBookingDateDDMMYYYY_(value) {
  return normalizeAnyBookingDateDDMMYYYY_(value);
}

function normalizeBookingDateDDMMYYYY_(value) {
  return normalizeAnyBookingDateDDMMYYYY_(value);
}

/*
 * Robust date normalizer for Google Sheets / Apps Script values.
 *
 * Accepts:
 *   Date object
 *   DDMMYYYY
 *   YYYYMMDD
 *   DD/MM/YYYY
 *   DD-MM-YYYY
 *   YYYY/MM/DD
 *   YYYY-MM-DD
 *   ISO date/time strings
 *
 * Always returns DDMMYYYY in Asia/Kolkata.
 */
function normalizeAnyBookingDateDDMMYYYY_(value) {
  if (value === null || value === undefined || value === "") return "";

  if (Object.prototype.toString.call(value) === "[object Date]") {
    const ms = value.getTime();
    if (Number.isFinite(ms)) {
      return Utilities.formatDate(value, "Asia/Kolkata", "ddMMyyyy");
    }
  }

  const raw = String(value).trim();
  if (!raw) return "";

  // Exact 8-digit date.
  if (/^\d{8}$/.test(raw)) {
    /*
     * Distinguish YYYYMMDD from DDMMYYYY by validating the calendar
     * positions. For example:
     *   20260819 -> YYYYMMDD
     *   19082026 -> DDMMYYYY
     *
     * The old test only looked at the first two digits and therefore
     * incorrectly interpreted 19082026 as year 1908 / month 20.
     */
    const firstYear = Number(raw.substring(0,4));
    const firstMonth = Number(raw.substring(4,6));
    const firstDay = Number(raw.substring(6,8));

    if (
      firstYear >= 1900 &&
      firstYear <= 2100 &&
      firstMonth >= 1 &&
      firstMonth <= 12 &&
      firstDay >= 1 &&
      firstDay <= 31
    ) {
      // YYYYMMDD -> DDMMYYYY
      return raw.substring(6,8) + raw.substring(4,6) + raw.substring(0,4);
    }

    // Otherwise treat it as DDMMYYYY.
    return raw;
  }

  // Date with separators. Prefer the 4-digit year to determine ordering.
  let m = raw.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?:\D.*)?$/);
  if (m) {
    const y = m[1];
    const mo = String(m[2]).padStart(2,"0");
    const d = String(m[3]).padStart(2,"0");
    return d + mo + y;
  }

  m = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:\D.*)?$/);
  if (m) {
    const d = String(m[1]).padStart(2,"0");
    const mo = String(m[2]).padStart(2,"0");
    const y = m[3];
    return d + mo + y;
  }

  // ISO timestamps such as 2026-08-18T00:00:00.000Z.
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, "Asia/Kolkata", "ddMMyyyy");
  }

  return "";
}


function getTodayDDMMYYYY_() {
  return Utilities.formatDate(new Date(), "Asia/Kolkata", "ddMMyyyy");
}


function getNextSerial_(sheet, dateString) {
  /*
   * FAST PATH:
   * Appointment numbers are maintained as a small per-city/per-date
   * counter instead of scanning the complete Appointment ID column.
   *
   * The caller already holds the ScriptLock, so incrementing this counter
   * is atomic within the booking system.
   */
  const city = sheet.getName();
  const props = PropertiesService.getScriptProperties();
  const key = "APPT_SERIAL_" + city + "_" + dateString;

  const stored = Number(props.getProperty(key));

  if (Number.isFinite(stored) && stored >= 0) {
    const next = stored + 1;
    props.setProperty(key, String(next));
    return next;
  }

  /*
   * One-time initialization for this city/date. This preserves the exact
   * existing appointment-number sequence if the property counter did not
   * exist before this deployment.
   */
  const maxSerial = getMaxSerialForDate_(sheet, dateString);
  const next = maxSerial + 1;
  props.setProperty(key, String(next));
  return next;
}


function getOrCreateSheet_(ss, city) {
  let sheet = ss.getSheetByName(city);

  if (!sheet) {
    sheet = ss.insertSheet(city);
    ensureHeader_(sheet);
  }

  return sheet;
}


/*
 * Upgrades existing city sheets to the current 20-column schema.
 * Existing appointment rows are preserved.
 *
 * R stores OPD Booking Request ID.
 * S stores EEG Booking Request ID.
 * K stores Next Followup City for Latur OPD bookings; other city rows stay blank.
 */
function ensureHeader_(sheet) {
  const width = Math.max(sheet.getLastColumn(), HEADERS.length);

  let current = sheet
    .getRange(1, 1, 1, width)
    .getDisplayValues()[0];

  if (current[0] === "" && sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  } else {
    for (let i = 0; i < HEADERS.length; i++) {
      if (String(current[i] || "") !== HEADERS[i]) {
        sheet.getRange(1, i + 1).setValue(HEADERS[i]);
      }
    }
  }

  sheet.setFrozenRows(1);
  sheet.getRange("A:A").setNumberFormat("@");
  sheet.getRange("C:C").setNumberFormat("dd/mm/yyyy hh:mm:ss");
  sheet.getRange("H:H").setNumberFormat("@");
  sheet.getRange("L:Q").setNumberFormat("0");
  sheet.getRange("R:T").setNumberFormat("@");
}


function normalizePatientRowFormatting_(ss) {
  SHEET_NAMES.forEach(function(name) {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;

    /*
     * Preserve row 1 exactly as the main headline/header.
     */
    sheet.getRange(1, 1, 1, HEADERS.length)
      .setFontWeight("bold")
      .setBackground("#5b21b6")
      .setFontColor("#ffffff");

    /*
     * Remove the old blue/purple fill from all patient rows.
     * This also cleans the blue row(s) that came from the old template.
     */
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(
        2, 1,
        lastRow - 1,
        HEADERS.length
      )
        .setBackground("#ffffff")
        .setFontColor("#000000")
        .setFontWeight("normal");
    }

    /*
     * Automatically size each column to its current content.
     */
    sheet.autoResizeColumns(1, HEADERS.length);
  });
}


function styleSheet_(sheet) {
  /*
   * Main headline/header only.
   */
  sheet.getRange(1, 1, 1, HEADERS.length)
    .setFontWeight("bold")
    .setBackground("#5b21b6")
    .setFontColor("#ffffff");

  /*
   * Patient/data rows stay plain white.
   */
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(
      2, 1,
      lastRow - 1,
      HEADERS.length
    )
      .setBackground("#ffffff")
      .setFontColor("#000000")
      .setFontWeight("normal");
  }

  /*
   * No hard-coded column widths.
   * Google Sheets sizes each column according to its contents.
   */
  sheet.autoResizeColumns(1, HEADERS.length);
}


function formatInsertedRow_(sheet, rowNumber) {
  const row = sheet.getRange(rowNumber, 1, 1, HEADERS.length);
  row.setBackground("#ffffff");
  row.setFontColor("#000000");
  row.setFontWeight("normal");

  sheet.getRange(rowNumber, 1).setNumberFormat("@");
  sheet.getRange(rowNumber, 3).setNumberFormat("dd/mm/yyyy hh:mm:ss");
  sheet.getRange(rowNumber, 8).setNumberFormat("@");
  sheet.getRange(rowNumber, 12, 1, 6).setNumberFormat("0");
  sheet.getRange(rowNumber, 18, 1, 3).setNumberFormat("@");
}


function pad2_(n) {
  return String(n).padStart(2, "0");
}


function clean_(value) {
  return String(value == null ? "" : value).trim();
}


function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


/* ========================= MULTI-PAGE V1 ADDITIONS ========================= */

function visitRuleForDate_(city,key){
  if(!/^\d{8}$/.test(String(key||""))) return false;
  const d=Number(key.slice(0,2)),m=Number(key.slice(2,4)),y=Number(key.slice(4));
  const dt=new Date(Date.UTC(y,m-1,d)); if(dt.getUTCFullYear()!=y||dt.getUTCMonth()!=m-1||dt.getUTCDate()!=d)return false;
  const day=dt.getUTCDay()||7,ord=Math.floor((d-1)/7)+1;
  if(city==="Latur") return (day>=1&&day<=3)||(day===5)||(day===6)||(day===4&&ord===5);
  if(city==="Nilanga") return day===6&&ord===1;
  if(city==="Udgir") return day===7&&(ord===2||ord===4);
  if(city==="Beed") return day===4&&(ord===2||ord===4);
  if(city==="Ambajogai") return day===7&&(ord===1||ord===3);
  if(city==="Parli") return day===7&&(ord===1||ord===3);
  if(city==="Dharashiv") return day===4&&(ord===1||ord===3);
  if(city==="Barshi") return day===4&&(ord===1||ord===3);
  if(city==="Omerga") return day===6&&ord!==1;
  return false;
}
function validateVisitDateForCity_(city,key){
  if(!visitRuleForDate_(city,key)) {
    throw new Error("The selected date is not an available visit date for "+city+".");
  }
  if(!isTodayOrFutureBookingDate_(key)) {
    throw new Error("Past appointment dates cannot be booked.");
  }
}
function isTodayOrFutureBookingDate_(key){
  const raw=String(key||"");
  if(!/^\d{8}$/.test(raw)) return false;
  const selected=Number(raw.slice(4)+raw.slice(2,4)+raw.slice(0,2));
  const todayRaw=getTodayDDMMYYYY_();
  const today=Number(todayRaw.slice(4)+todayRaw.slice(2,4)+todayRaw.slice(0,2));
  return selected>=today;
}
function getAvailableDates_(data){
  const city=normalizeCity_(data.city),y=Number(data.year),m=Number(data.month);
  if(!Number.isInteger(y)||!Number.isInteger(m)||m<1||m>12)throw new Error("Invalid calendar month.");
  const last=new Date(Date.UTC(y,m,0)).getUTCDate(),dates=[];
  for(let d=1;d<=last;d++){const k=String(d).padStart(2,"0")+String(m).padStart(2,"0")+y;if(visitRuleForDate_(city,k))dates.push(k);}
  return {ok:true,city:city,year:y,month:m,dates:dates};
}
function patientObject_(row,city){
  const op=getStoredPayment_(row,12,13,row[11]);
  const eg=row[14]===""?{cashPaid:0,onlinePaid:0,totalPaid:0}:getStoredPayment_(row,15,16,row[14]);
  const bookingTimestampMs=getTimestampMs_(row[2]);
  return {appointmentId:row[0],date:row[1],bookingTimestamp:row[2],bookingTimestampMs:bookingTimestampMs,name:row[3],age:parseAgeValue_(row[4]),ageUnit:parseAgeUnit_(row[4]),address:row[5]||"",patientType:row[6]||"",whatsapp:normalizePhone_(row[7]),city:row[8]||city,referredBy:row[9]||"",nextFollowupCity:row[10]||"",opdCharges:Number(row[11])||0,opdCashPaid:op.cashPaid,opdOnlinePaid:op.onlinePaid,opdTotalPaid:op.totalPaid,eegCharges:row[14]===""?null:Number(row[14])||0,eegCashPaid:eg.cashPaid,eegOnlinePaid:eg.onlinePaid,eegTotalPaid:eg.totalPaid,eegBookingRequestId:row[18]||"",eegUpdateRequestId:row[19]||""};
}
function getPatientHistoryByWhatsApp_(data){
  const phone=normalizePhone_(data.whatsapp);
  if(!/^[6-9]\d{9}$/.test(phone))throw new Error("Invalid WhatsApp number.");

  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const todayCities=getTodayVisitCities_().cities||[];
  const result=findPatientsByWhatsApp_(ss,phone,todayCities);

  if(!result.matches.length)throw new Error("No patient was found with this WhatsApp number.");

  const groups=result.groups.map(g=>({
    city:g.city,
    scheduledToday:g.scheduledToday,
    patients:g.matches.map(m=>patientObject_(m.row,m.city))
  }));

  return {
    ok:true,
    scheduledCities:todayCities,
    groups:groups,
    // Keep the flat array for backward compatibility with any older frontend.
    patients:result.matches.map(m=>patientObject_(m.row,m.city))
  };
}
function updateOPDDetails_(data){
  const id=clean_(data.updateRequestId),aid=clean_(data.appointmentId),city=normalizeCity_(data.city),lookupPhone=normalizePhone_(data.whatsapp);
  if(!id||!aid)throw new Error("Update request is incomplete.");
  const found=findPatientByAppointmentId_(SpreadsheetApp.getActiveSpreadsheet(),aid,lookupPhone,city);
  if(!found)throw new Error("Today's OPD appointment could not be found.");
  if(normalizeBookingDateDDMMYYYY_(found.row[1])!==getTodayDDMMYYYY_())throw new Error("Only today's OPD appointment can be updated.");
  if(String(found.row[19]||"")===id)return {ok:true,updated:true,alreadyRecorded:true,before:patientObject_(found.row,city),after:patientObject_(found.row,city)};
  const name=clean_(data.name),age=Number(data.age),unit=clean_(data.ageUnit),newPhone=normalizePhone_(data.whatsappNew||data.whatsapp),charges=Number(data.opdCharges);
  validateAppointment_(name,age,unit,newPhone,found.row[6]||"Follow-up",charges);
  const p=normalizePayment_(data.opdPaymentMode,data.opdCashPaid,data.opdOnlinePaid,charges,"OPD");
  const before=patientObject_(found.row,city),r=found.row.slice();
  r[3]=name;r[4]=formatAge_(age,unit);r[5]=clean_(data.address);r[7]=newPhone;r[9]=clean_(data.referredBy);r[10]=clean_(data.nextFollowupCity);r[11]=charges;r[12]=p.cashPaid;r[13]=p.onlinePaid;r[19]=id;
  const lock=LockService.getScriptLock();if(!lock.tryLock(5000))throw new Error("Update service is temporarily busy. Please retry.");
  try{found.sheet.getRange(found.rowNumber,1,1,HEADERS.length).setValues([r]);return {ok:true,updated:true,alreadyRecorded:false,appointmentId:aid,before:before,after:patientObject_(r,city)}}finally{lock.releaseLock();}
}
function updateEEGDetails_(data){
  const id=clean_(data.updateRequestId),aid=clean_(data.appointmentId),city=normalizeCity_(data.city),phone=normalizePhone_(data.whatsapp);
  if(!id||!aid)throw new Error("Update request is incomplete.");
  const found=findPatientByAppointmentId_(SpreadsheetApp.getActiveSpreadsheet(),aid,phone,city);
  if(!found)throw new Error("Today's EEG appointment could not be found.");
  if(normalizeBookingDateDDMMYYYY_(found.row[1])!==getTodayDDMMYYYY_())throw new Error("Only today's EEG appointment can be updated.");
  if(found.row[14]===""||found.row[14]==null)throw new Error("No EEG booking exists for this patient today.");
  if(String(found.row[19]||"")===id)return {ok:true,updated:true,alreadyRecorded:true,before:patientObject_(found.row,city),after:patientObject_(found.row,city)};
  const charges=Number(data.eegCharges);if(!Number.isFinite(charges)||charges<0||charges>3000)throw new Error("EEG charges must be between ₹0 and ₹3000.");
  const p=normalizePayment_(data.eegPaymentMode,data.eegCashPaid,data.eegOnlinePaid,charges,"EEG"),before=patientObject_(found.row,city),r=found.row.slice();
  r[14]=charges;r[15]=p.cashPaid;r[16]=p.onlinePaid;r[19]=id;
  const lock=LockService.getScriptLock();if(!lock.tryLock(5000))throw new Error("Update service is temporarily busy. Please retry.");
  try{found.sheet.getRange(found.rowNumber,1,1,HEADERS.length).setValues([r]);return {ok:true,updated:true,alreadyRecorded:false,appointmentId:aid,before:before,after:patientObject_(r,city)}}finally{lock.releaseLock();}
}
function getUpdateStatus_(data){
  const aid=clean_(data.appointmentId),city=normalizeCity_(data.city),phone=normalizePhone_(data.whatsapp||"");
  const found=findPatientByAppointmentId_(SpreadsheetApp.getActiveSpreadsheet(),aid,phone,city);
  if(!found)return {ok:true,found:false};
  return {ok:true,found:String(found.row[19]||"")===clean_(data.updateRequestId),patient:patientObject_(found.row,city)};
}


/* ===================== HTML78-v2 HARDENING ===================== */
function verifyPortalPasswordV2_(password){
  return clean_(password)==="265044";
}
function getPortalBootstrapV2_(data){
  return {ok:true,timezone:"Asia/Kolkata",
    cities:["Latur","Nilanga","Udgir","Beed","Ambajogai","Parli","Dharashiv","Omerga","Barshi"],
    opdDefault:500,opdMax:2000,eegLatur:1100,eegOther:1600,eegMax:3000};
}
function getTodayVisitCitiesV2_(data){ return getTodayVisitCities_(); }



/* ===================== REFUND PORTAL ===================== */
function getRefundPatientByWhatsApp_(data){
  const phone=normalizePhone_(data.whatsapp);
  if(!/^[6-9]\d{9}$/.test(phone)) throw new Error("Invalid WhatsApp number.");
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const result=findPatientsByWhatsApp_(ss,phone,getTodayVisitCities_().cities||[]);
  const today=getTodayDDMMYYYY_();
  const patients=[];
  result.matches.forEach(function(m){
    const r=m.row;
    if(normalizeBookingDateDDMMYYYY_(r[1])!==today) return;

    const p=patientObject_(r,m.city);
    p.refundRow=m.rowNumber;

    p.opdRefund=Number(r[20]||0)||0;
    p.eegRefund=Number(r[21]||0)||0;

    const opdPending = Number(p.opdTotalPaid||0) > p.opdRefund;
    const eegPending = Number(p.eegTotalPaid||0) > p.eegRefund;

    // Do not show fully refunded patients.
    if(!opdPending && !eegPending) return;

    p.refundAvailable={
      opd: opdPending,
      eeg: eegPending
    };

    patients.push(p);
  });
  if(!patients.length) throw new Error("No today's refundable appointment found.");
  return {ok:true,patients:patients};
}
function saveRefund_(data){
  const city=normalizeCity_(data.city),aid=clean_(data.appointmentId);
  const found=findPatientByAppointmentId_(SpreadsheetApp.getActiveSpreadsheet(),aid,normalizePhone_(data.whatsapp),city);
  if(!found) throw new Error("Today's appointment not found.");
  if(normalizeBookingDateDDMMYYYY_(found.row[1])!==getTodayDDMMYYYY_()) throw new Error("Refund allowed only for today's booking.");
  const r=found.row.slice();
  const op=getStoredPayment_(r,12,13,r[11]);
  const eg=r[14]===""?{totalPaid:0}:getStoredPayment_(r,15,16,r[14]);
  const or=Number(data.opdRefund||0), er=Number(data.eegRefund||0);
  if(or<0||er<0) throw new Error("Refund cannot be negative.");
  if(or>op.totalPaid) throw new Error("OPD refund cannot exceed OPD paid amount.");
  if(er>eg.totalPaid) throw new Error("EEG refund cannot exceed EEG paid amount.");
  r[20]=or; r[21]=er;
  found.sheet.getRange(found.rowNumber,1,1,HEADERS.length).setValues([r]);
  return {ok:true,saved:true,patient:patientObject_(r,city)};
}
