const routes = {
    '/': 'overview',
    '/overview': 'overview',
    '/mutual-funds': 'mutual-funds',
    '/stocks': 'stocks',
    '/term-deposits': 'term-deposits',
};

function hashPath() {
    return window.location.hash.slice(1) || '/';
}
function basePath() {
    return hashPath().split('?')[0];
}
export function getCurrentRoute() {
    return routes[basePath()] || 'overview';
}
export function getRouteQuery() {
    const q = hashPath().split('?')[1] || '';
    return new URLSearchParams(q);
}
export function navigate(path) {
    window.location.hash = path;
}
