import { getIconForFolder, getIconForFile } from "vscode-material-icon-theme-js";

interface ISystemProps {
    label: string,
    keywords: string[],
    icon: string
}

export const systems: ISystemProps[] = [
    { label: 'Windows', icon: 'windows', keywords: ['windows'] },
    { label: 'Linux', icon: 'linux', keywords: ['linux'] },
    { label: 'Arch Linux', icon: 'arch', keywords: ['arch', 'linux'] },
    { label: 'CentOS', icon: 'centos', keywords: ['centos', 'linux'] },
    { label: 'Debian', icon: 'debian', keywords: ['debian', 'linux'] },
    { label: 'Deepin', icon: 'deepin', keywords: ['deepin', 'linux'] },
    { label: 'Kali Linux', icon: 'kali', keywords: ['kali', 'linux'] },
    { label: 'Red Hat', icon: 'redhat', keywords: ['redhat', 'linux'] },
    { label: 'SUSE', icon: 'suse', keywords: ['suse', 'linux'] },
    { label: 'Ubuntu', icon: 'ubuntu', keywords: ['ubuntu', 'linux'] },
    { label: 'Oracle', icon: 'oracle', keywords: ['oracle'] },
    { label: 'openEuler', icon: 'open-euler', keywords: ['open-euler', 'linux'] },
    { label: 'Fedora', icon: 'fedora', keywords: ['fedora', 'linux'] },
    { label: 'VNC', icon: 'vnc', keywords: ['vnc'] },
    { label: 'Ubuntu Kylin', icon: 'ubuntu-kylin', keywords: ['kylin', 'ubuntu', 'linux'] },
    { label: 'macOS', icon: 'mac', keywords: ['mac', 'apple'] },
]

export function querySearch(keyword: string, callback: Function): void {
    const normalizedKeyword = keyword.trim().toLowerCase();
    const results = normalizedKeyword
        ? systems.filter((item) => {
            const searchTargets = [item.label, item.icon, ...item.keywords]
                .filter(Boolean)
                .map((value) => value.toLowerCase());
            return searchTargets.some((value) => value.includes(normalizedKeyword));
        })
        : systems
    callback(results.length > 0 ? results : systems)
}

/**
 * 根据名称获取系统名称
 *
 * @param system 待匹配的系统名称
 */
export function getSystemIcon(system: string) {
    const normalizeName = /^([a-zA-Z]+)/.exec(system);
    return normalizeName && normalizeName[0] || 'linux'
}

export function getIcon(name: string, type: 'file' | 'folder' | 'link' | undefined) {
    switch (type) {
        case 'file':
            return getFileIcon(name)
        case 'folder':
            return getFolderIcon(name)
        case 'link':
            return ['bin', 'sbin', 'lib', 'lib64'].includes(name) ? 'folder-link' : 'file-link'
        default:
            return 'unknown'
    }
}

export function getFileIcon(name: string) {
    return (getIconForFile(name) || 'file').replace?.('.svg', '')
}

export function getFolderIcon(name: string) {
    return getIconForFolder(name).replace('.svg', '')
}