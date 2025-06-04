const Toolbox = {
  stamp: () => {
    return new Date().getTime();
  },
  day: (seperator, stamp) => {
    const dt = !stamp ? new Date() : new Date(stamp);
    const year = dt.getFullYear();
    const month = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    const sp = !seperator ? "_" : seperator;
    return `${year}${sp}${month}${sp}${day}`;
  },
  minute: (seperator, stamp) => {
    const dt = !stamp ? new Date() : new Date(stamp);
    const hour = String(dt.getHours()).padStart(2, "0");
    const minute = String(dt.getMinutes()).padStart(2, "0");
    const sp = !seperator ? "_" : seperator;
    return `${hour}${sp}${minute}`;
  },
  rand: (m, n) => {
    return Math.round(Math.random() * (m - n) + n);
  },
  char: (n, pre) => {
    n = n || 7;
    pre = pre || "";
    for (let i = 0; i < n; i++)
      pre +=
        i % 2
          ? String.fromCharCode(Toolbox.rand(65, 90))
          : String.fromCharCode(Toolbox.rand(97, 122));
    return pre;
  },
  shorten: (addr, n) => {
    if (n === undefined) n = 10;
    return addr.substr(0, n) + "..." + addr.substr(addr.length - n, n);
  },
  clone: (obj) => {
    return JSON.parse(JSON.stringify(obj));
  },
  tail: (str, n, tailor) => {
    return str.substr(0, n) + (tailor === undefined ? "..." : tailor);
  },
  isType: (obj, type) => {
    return !!type ? Toolbox.type(obj) === type.toLowerCase() : Toolbox.type(obj)
  },
  type: (obj) => {
    return Object.prototype.toString.call(obj).slice(8, -1).toLowerCase();
  },
  unique:(arr)=>{
    return [...new Set(arr)];
  },
  empty: (obj) => {
    if (JSON.stringify(obj) === "{}") return true;
    return false;
  },
  toDate: (stamp) => {
    return new Date(stamp).toLocaleString();
  },
  toF: (a, fix) => {
    fix = fix || 3; return parseFloat(a.toFixed(fix))
  },
  extend: (path, data, force, target) => {
    const len = path.length
    let p = target;
    for (let i in path) {
      const kk = path[i];
      if (i == len - 1) {
        if (p[kk]) {
          if (force) {
            delete p[kk];
            p[kk] = data;
          } else {
            if (self.isType(data, 'object')) {
              for (dk in data) {
                p[kk][dk] = data[dk];
              }
            } else {
              delete p[kk];
              p[kk] = data;
            }
          }
        } else {
          if (force) p[kk] = data;
          else return false;
        }
      } else {
        if (!p[kk]) {
          if (force) p = p[kk] = {};
          else return false;
        } else {
          p = p[kk];
        }
      }
    }
    return true;
  },
};

export default Toolbox;