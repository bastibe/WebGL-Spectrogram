.PHONY: clean run

OS := $(shell uname)

run:
	python server.py

clean:
	find . -type f -name '*.py[cod]' -delete
	find . -type f -name '*.*~' -delete

installdeps:
ifeq ('$(OS)','Darwin')
	# Run MacOS commands
	cat packages-osx.txt | xargs brew install
else
	# Run Linux commands
	cat packages.txt | xargs sudo apt-get -y install
endif
	pip install -r requirements.txt

lint: clean
	flake8 .
