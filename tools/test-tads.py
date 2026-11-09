#!/usr/bin/env python3
"""Exercise the packaged TADS interpreter through the plugin's RemGlk protocol."""
import argparse
import json
import pathlib
import selectors
import subprocess
import tarfile
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--arch', choices=('x86_64', 'armel', 'armhf', 'aarch64'), default='x86_64')
parser.add_argument('--emulator', help='qemu-arm-static or qemu-aarch64-static')
args = parser.parse_args()

class Player:
    def __init__(self, story, cwd):
        command = ([args.emulator] if args.emulator else []) + [str(ROOT / 'binaries' / args.arch / 'tadsr'), str(story)]
        self.process = subprocess.Popen(command, cwd=cwd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=subprocess.PIPE)
        self.selector = selectors.DefaultSelector()
        self.selector.register(self.process.stdout, selectors.EVENT_READ)
        self.buffer = b''
        self.update = self.send({'type': 'init', 'gen': 0, 'metrics': {'width': 200, 'height': 200},
                                 'support': ['timer', 'hyperlinks', 'graphics', 'graphicswin']})

    def send(self, event):
        self.process.stdin.write(json.dumps(event).encode() + b'\n')
        self.process.stdin.flush()
        while True:
            try:
                data = self.buffer.decode()
                update, end = json.JSONDecoder().raw_decode(data.lstrip())
                self.buffer = data.lstrip()[end:].encode().lstrip()
                self.update = update
                break
            except (json.JSONDecodeError, UnicodeDecodeError):
                pass
            if not self.selector.select(timeout=30):
                raise AssertionError('interpreter did not produce an update within 30 seconds')
            chunk = self.process.stdout.read1(65536)
            if not chunk:
                raise AssertionError('interpreter exited: ' + self.process.stderr.read().decode(errors='replace'))
            self.buffer += chunk
        assert self.update.get('type') == 'update', self.update
        return self.update

    def command(self, value):
        request = next((r for r in self.update.get('input', []) if r.get('type') == 'line'), None)
        assert request, self.update
        self.send({'type': 'line', 'gen': self.update['gen'], 'window': request['id'], 'value': value})
        return self.text()

    def text(self):
        return '\n'.join(span.get('text', '') for content in self.update.get('content', [])
                         for row in content.get('text', []) for span in row.get('content', []))

    def filename(self, path):
        assert self.update.get('specialinput', {}).get('type') == 'fileref_prompt', self.update
        self.send({'type': 'specialresponse', 'gen': self.update['gen'],
                   'response': 'fileref_prompt', 'value': str(path)})
        return self.text()

    def close(self):
        self.process.terminate()
        try:
            self.process.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.communicate()
        self.selector.close()

with tempfile.TemporaryDirectory(prefix='tads-test-') as tmp:
    tmp = pathlib.Path(tmp)
    with tarfile.open(ROOT / 'sources/tadsr/tads-runner.tar.gz') as source:
        for name, title, commands, inventory in [
            ('ditch.gam', 'Ditch Day Drifter', ['look under bed', 'open drawer', 'get all', 'west', 'read sign'], 'one dollar bill'),
            ('ditch3.t3', 'Return to Ditch Day', ['', 'x xojo', 'x guanmgon', 'x scu', 'say yes', 'x ct-22', 'take hv chip', 'x tester', 'read stickers', 'open tester'], 'chip'),
        ]:
            story = tmp / name
            story.write_bytes(source.extractfile('tads-runner/tests/' + name).read())
            player = Player(story, tmp)
            try:
                assert title in player.text(), player.text()
                for command in commands:
                    player.command(command)
                assert inventory in player.command('inventory').lower(), player.text()
                player.command('save')
                assert 'saved' in player.filename(tmp / (name + '.sav')).lower(), player.text()
                player.command('restart')
                player.command('yes')
                player.command('restore')
                assert 'restored' in player.filename(tmp / (name + '.sav')).lower(), player.text()
                assert inventory in player.command('inventory').lower(), player.text()
                print(f'PASS {args.arch} {name}: startup, commands, inventory, save, restart, restore')
            finally:
                player.close()
