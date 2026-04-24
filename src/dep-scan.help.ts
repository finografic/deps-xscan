import pc from 'picocolors';

export function printHelp(): void {
  const lines: string[] = [];

  lines.push('');
  lines.push(`${pc.bold('dep-scan')} - TODO: describe your CLI tool`);
  lines.push('');

  lines.push(pc.bold('USAGE'));
  lines.push(`  ${pc.cyanBright('dep-scan')} ${pc.dim(pc.cyan('<command>'))} [options]`);
  lines.push('');

  lines.push(pc.bold('COMMANDS'));
  const commands = [
    { name: 'TODO', desc: 'Add your commands here' },
  ];
  const maxNameLength = Math.max(...commands.map((c) => c.name.length));
  for (const cmd of commands) {
    lines.push(`  ${pc.cyan(cmd.name)}${' '.repeat(maxNameLength - cmd.name.length + 4)}${cmd.desc}`);
  }
  lines.push('');

  lines.push(pc.bold('OPTIONS'));
  lines.push('  -h, --help       Show help for a command');
  lines.push('  -v, --version    Show version number');
  lines.push('');

  lines.push(pc.bold('EXAMPLES'));
  const examples = [
    { cmd: 'dep-scan TODO', comment: 'TODO: describe this example' },
  ];
  const maxCmdLength = Math.max(...examples.map((e) => e.cmd.length));
  for (const ex of examples) {
    lines.push(`  ${ex.cmd}${' '.repeat(maxCmdLength - ex.cmd.length + 4)}${pc.dim('# ' + ex.comment)}`);
  }
  lines.push('');

  lines.push(pc.bold('GET HELP'));
  lines.push(`  ${pc.cyanBright('dep-scan')} ${pc.dim(pc.cyan('<command>'))} --help       ${pc.dim('# Show detailed help for a command')}`);
  lines.push('');

  console.log(lines.join('\n'));
}
