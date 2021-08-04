/**
 * Counts the number of lines of a given string
 */
export const countLines = (str: string) => str.split(/\r\n|\r|\n/).length;
