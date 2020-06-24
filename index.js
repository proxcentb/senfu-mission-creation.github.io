const earthEquatorRadius = 6378000;
const scaleSquared = 1.0066178027914812;
let waypoints;

function openFile(event) {
  const input = event.target;

  const reader = new FileReader();
  reader.onload = () => waypoints = JSON.parse(reader.result);
  reader.readAsText(input.files[0]);
};

function getDef(lat) {
  const k1 = Math.tan(lat * Math.PI / 180);
	const k2 = scaleSquared * k1;
  const sqrt = Math.sqrt(1 + k2 * k2);
  const k3 = earthEquatorRadius * sqrt;
  return { k1, k2, k3, sqrt };
}

function getLonCircumference(k1, k2, dy, sqrt) {
  return Math.PI * (2 * earthEquatorRadius / Math.sqrt(1 + k1 * k2) - dy * k2 / sqrt);
}

function getCoords([ lat, lon ], deltas) {
  const { k1, k2, k3, sqrt } = getDef(lat);
	const k4 = deltas[1] * Math.sqrt(1 + k1 * k2);

	const newLat = Math.atan((k1 * k3 + k4) / (k3 - k2 * k4)) * 180 / Math.PI;
	const lonCircumference = getLonCircumference(k1, k2, deltas[1], sqrt);
	const newLon = lon + 360 * deltas[0] / lonCircumference;

	return [ newLat, newLon, deltas[2] ];
}

function getOffsetAngle(lat1, lon1, lat2, lon2) {
  const { k1, k2, k3, sqrt } = getDef(lat1);
  const k4 = Math.tan(lat2 * Math.PI / 180);

  const dy = k3 * (k4 - k1) / sqrt / (1 + k4 * k2);
	const lonCircumference = getLonCircumference(k1, k2, dy, sqrt);
  const dx = (lon2 - lon1) * lonCircumference / 360;

  return Math.atan2(dy, dx);
}

function getLine(lat, lon, alt, ...actions) {
  const remainedActions = '-1,0,'.repeat(15 - actions.length);
  // latitude, longitude, altitude(m), heading(deg),
  // curvesize(m), rotationdir, gimbalmode, gimbalpitchangle,
  // actiontype1, actionparam1, ..., actiontype15, actionparam15,
  // altitudemode, speed(m/s), poi_latitude, poi_longitude,
  // poi_altitude(m), poi_altitudemode, photo_timeinterval,
  return `${lat},${lon},${alt},0,0,0,0,0,${actions.join('')}${remainedActions}0,1,0,0,0,0,0,0\n`;
}

function fullSceneShooting(offsetAngle) {
  const actionsMap = new Map([
    ['rotate', (x = 0) => `4,${Math.floor(x - offsetAngle * 180 / Math.PI)},`],
    ['tilt', (x = 0) => `5,${x},`],
    ['take photo', () => '1,0,'],
    ['wait', (x = 300) => `0,${x},`],
  ])

  return (type, args) => {
    switch(type) {
      case 'wait': return getLine(...args, actionsMap.get('wait')());
      case 'path': return getLine(...args);
      case 'view': return config.actions
        .reduce((pack, action, index) => {
          if (index % 15 === 0) pack.push([]);
          pack[pack.length - 1].push(action);
          return pack;
        }, [])
        .reduce((csv, actionsPack, index, packs) => {
          csv += getLine(...args, ...actionsPack.map(([ name, value ]) => actionsMap.get(name)(value)));
          if (index !== packs.length - 1)
            csv += getLine(args[0], args[1], args[2] + 1);
          return csv;
        }, '')
    }
  }
}

function getCSV() {
  const test = document.querySelector('.test').checked;

  // Get GPS positions and define offsetAngle
  const [ pos1, pos2 ] = 
    ['.position1Box', '.position2Box'].map(q1 => ['.lat', '.lon'].map(q2 => Number(document.querySelector(`${q1} ${q2}`).value)));
  const offsetAngle = getOffsetAngle(...pos1, ...pos2);

  let csv = '';
  let missionViewsDone = 0;
  const getCSVText = fullSceneShooting(offsetAngle);

  waypoints.forEach(({ position: [ dx, dy, dz ], type }, index) => {
    const dist = Math.sqrt(dx ** 2 + dy ** 2);
    const angle = Math.atan2(dy, dx) + offsetAngle;
    csv += getCSVText(test ? "wait" : type, getCoords(pos1, [dist * Math.cos(angle), dist * Math.sin(angle), dz]))

    if (
      (type === 'view' && ++missionViewsDone % config.maxWaypoints === 0 && !test) ||
      (index === waypoints.length - 1)
    ) {
      download(csv, test);
      csv = '';
      missionViewsDone = 0;
    }
  })
}

function download(data, test) {
  const a = document.createElement("a");
  a.href = 'data:text/csv;charset=utf-8,' + encodeURI(data);
  a.download = document.querySelector(".saveAs").value + (test ? '-test' : '') + '.csv';
  a.click();
}