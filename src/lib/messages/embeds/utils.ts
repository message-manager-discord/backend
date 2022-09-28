// taken directly from github.com/segment-boneyard/is-isodate/blob/master/index.js

/**
 * ISO date matcher.
 *
 * http://www.w3.org/TR/NOTE-datetime
 */

const matcher = new RegExp(
  "^\\d{4}-\\d{2}-\\d{2}" + // Match YYYY-MM-DD
    "((T\\d{2}:\\d{2}(:\\d{2})?)" + // Match THH:mm:ss
    "(\\.\\d{1,6})?" + // Match .sssss
    "(Z|(\\+|-)\\d{2}:\\d{2})?)?$" // Time zone (Z or +hh:mm)
);

function isIsoDate(string: string) {
  return (
    typeof string === "string" &&
    matcher.test(string) &&
    !isNaN(Date.parse(string))
  );
}
export { isIsoDate };
