export function escapeLatex(value) {
    return String(value || '').replace(/([\\%$#_{}~^])/g, '\\$1');
}

export function buildMatrixLatex(matrix, bracketType = 'pmatrix') {
    const rowsText = matrix.map((row) => row.join(' & ')).join(' \\\\ ');
    return `\\begin{${bracketType}}\n${rowsText}\n\\end{${bracketType}}`;
}

export function buildVectorLatex(values, orientation = 'column') {
    const content = orientation === 'row'
        ? values.join(' & ')
        : values.join(' \\\\ ');
    return `\\begin{pmatrix} ${content} \\\\end{pmatrix}`;
}
